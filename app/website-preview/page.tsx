'use client';

import { useState, useEffect } from 'react';

export default function WebsitePreview() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Real listings from courtneyokanlomo.com
  const listings = [
    {
      image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/27413120/-3703647671636790085.jpg',
      price: '$759,800',
      address: '3103 Lelia Street Unit: A and B',
      city: 'Houston, TX',
      beds: 3,
      baths: 3,
      sqft: '3,458',
      badge: 'Open House'
    },
    {
      image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/21154925/-5823161010216405600.jpg',
      price: '$665,000',
      address: '936 Brookwood Drive',
      city: 'Dallas, TX',
      beds: 4,
      baths: 4,
      sqft: '2,994',
      badge: 'For Sale'
    },
    {
      image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/88627905/8322605856205348101.jpg',
      price: '$470,000',
      address: '11402 Collinsia Lane',
      city: 'Cypress, TX',
      beds: 4,
      baths: 3,
      sqft: '2,169',
      badge: 'For Sale'
    },
    {
      image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/21204937/-6971321241190329174.jpg',
      price: '$379,900',
      address: '3224 Sioux Trail',
      city: 'Crandall, TX',
      beds: 4,
      baths: 4,
      sqft: '2,673',
      badge: 'For Sale'
    },
    {
      image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/98933377/4714277768199769826.jpg',
      price: '$349,900',
      address: '3804 Sayers Street',
      city: 'Houston, TX',
      beds: 3,
      baths: 3,
      sqft: '1,593',
      badge: 'New Construction'
    },
    {
      image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/21178190/-7239361692667679586.jpg',
      price: '$245,000',
      address: '1309 Pennsylvania Avenue',
      city: 'Dallas, TX',
      beds: 3,
      baths: 3,
      sqft: '1,380',
      badge: 'Under Contract'
    }
  ];

  // Neighborhood images from Courtney's site
  const neighborhoods = [
    { name: 'Cypress', image: 'https://media-production.lp-cdn.com/media/w12r6bpxzyvslncfx4vt' },
    { name: 'The Heights', image: 'https://media-production.lp-cdn.com/media/j4e2upot0p7moxlexbzw' },
    { name: 'Oak Cliff', image: 'https://media-production.lp-cdn.com/media/gunjg851qixw05nqgi2s' },
    { name: 'Katy', image: 'https://media-production.lp-cdn.com/media/sgqzqdoauxjeorskbuom' },
  ];

  // Real testimonials from coachingbrokerage.com
  const testimonials = [
    {
      quote: "I have joined CRC this year and the first 6 months has been amazing. I love that Courtney is so professional and encouraging. My prior two years in real estate was nothing compared to the topnotch knowledge, support, and family environment I have here.",
      author: "Twila B.",
      type: "Agent"
    },
    {
      quote: "It was a great experience getting the chance to speak with Courtney one-on-one. She is very knowledgeable and helped out with all the questions I needed answered.",
      author: "Eric R.",
      type: "Client"
    },
    {
      quote: "Courtney was an amazing host for this 1/1 meeting. I got insightful information, she is always a pleasure to speak with!",
      author: "Moneasia T.",
      type: "Agent"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="site">
      {/* Navigation */}
      <nav className={`nav ${scrolled ? 'nav-scrolled' : ''}`}>
        <div className="logo">
          <img 
            src="https://media-production.lp-cdn.com/media/tfyio0knwbjij9ifmgga" 
            alt="Collective Realty Co."
            className="logo-img"
          />
        </div>
        <div className={`nav-links ${mobileMenuOpen ? 'nav-open' : ''}`}>
          <a href="#" onClick={() => setMobileMenuOpen(false)}>Buy</a>
          <a href="#" onClick={() => setMobileMenuOpen(false)}>Sell</a>
          <a href="#" onClick={() => setMobileMenuOpen(false)}>Agents</a>
          <a href="#" onClick={() => setMobileMenuOpen(false)}>Neighborhoods</a>
          <a href="#" onClick={() => setMobileMenuOpen(false)}>About</a>
          <a href="#" className="nav-cta" onClick={() => setMobileMenuOpen(false)}>Contact</a>
        </div>
        <button 
          className={`hamburger ${mobileMenuOpen ? 'hamburger-open' : ''}`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </nav>

      {/* Hero Section with video */}
      <section className="hero">
        <div className="hero-video">
          <video 
            autoPlay 
            muted 
            loop 
            playsInline
            poster="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&q=80"
          >
            <source src="https://cdn.pixabay.com/video/2020/07/30/45913-446930982_large.mp4" type="video/mp4" />
          </video>
          <div className="hero-overlay"></div>
        </div>
        <div className="hero-content">
          <p className="hero-eyebrow">Houston &amp; Dallas Real Estate</p>
          <h1 className="hero-title">Collective Realty Co.</h1>
          <p className="hero-sub">Exceptional service and expertise for buyers, sellers, and investors across Texas. Your home journey starts here.</p>
          <div className="hero-cta">
            <a href="#" className="btn btn-primary">Search Homes</a>
            <a href="#" className="btn btn-outline">Get Home Value</a>
          </div>
        </div>
        <div className="scroll-indicator">
          <span className="scroll-text">Scroll</span>
          <div className="scroll-line"></div>
        </div>
      </section>

      {/* Stats Section */}
      <div className="stats">
        <div className="stat">
          <div className="stat-num">19+</div>
          <div className="stat-label">Years Experience</div>
        </div>
        <div className="stat">
          <div className="stat-num">78</div>
          <div className="stat-label">Licensed Agents</div>
        </div>
        <div className="stat">
          <div className="stat-num">500+</div>
          <div className="stat-label">Families Served</div>
        </div>
        <div className="stat">
          <div className="stat-num">2</div>
          <div className="stat-label">Texas Markets</div>
        </div>
      </div>

      {/* Featured Listings - Real listings from Courtney's site */}
      <section className="section">
        <div className="section-header">
          <p className="section-eyebrow">Featured Properties</p>
          <h2 className="section-title">Current Listings</h2>
        </div>
        <div className="listings-grid">
          {listings.map((listing, i) => (
            <div key={i} className="listing">
              <div className="listing-img" style={{ backgroundImage: `url(${listing.image})` }}></div>
              <span className="listing-badge">{listing.badge}</span>
              <div className="listing-info">
                <div className="listing-price">{listing.price}</div>
                <div className="listing-addr">{listing.address}</div>
              </div>
              <div className="listing-overlay">
                <div className="listing-price">{listing.price}</div>
                <div className="listing-addr">{listing.address}, {listing.city}</div>
                <div className="listing-meta">{listing.beds} BD  |  {listing.baths} BA  |  {listing.sqft} Sq Ft</div>
                <button className="listing-btn">View Property</button>
              </div>
            </div>
          ))}
        </div>
        <div className="section-cta">
          <a href="#" className="btn btn-outline">View All Listings</a>
        </div>
      </section>

      {/* Broker Section - Courtney's actual photo and bio */}
      <section className="section broker-section">
        <div className="broker">
          <div className="broker-img">
            <img 
              src="https://media-production.lp-cdn.com/media/efe6ba81-3dae-4ae0-9784-5b6bbfd04f9f" 
              alt="Courtney Okanlomo"
            />
          </div>
          <div className="broker-content">
            <p className="broker-eyebrow">Meet Your Broker</p>
            <h2 className="broker-name">Courtney Okanlomo</h2>
            <p className="broker-title">Broker / Owner</p>
            <p className="broker-text">
              Courtney Okanlomo, an esteemed presence in Houston and Dallas real estate markets for over 19 years, 
              offers a wealth of real estate sales experience. Renowned for her dedication to quality service and 
              delivering results, Courtney has personally managed multimillion-dollar real estate deals.
            </p>
            <p className="broker-text">
              Holding a Bachelor&apos;s Degree in Business Administration with a major in Marketing from DePaul University, 
              Courtney&apos;s business acumen and marketing expertise are unmatched in any market environment. She is trusted 
              and admired in Houston and Dallas, consistently striving for excellence in every transaction.
            </p>
            <a href="#" className="btn btn-outline">Learn More About Courtney</a>
          </div>
        </div>
      </section>

      {/* Neighborhoods */}
      <section className="section">
        <div className="section-header">
          <p className="section-eyebrow">Explore</p>
          <h2 className="section-title">Neighborhoods We Serve</h2>
        </div>
        <div className="neighborhoods">
          {neighborhoods.map((hood, i) => (
            <div key={i} className="neighborhood" style={{ backgroundImage: `url(${hood.image})` }}>
              <span className="neighborhood-name">{hood.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials">
        <div className="section-header">
          <p className="section-eyebrow">Success Stories</p>
          <h2 className="section-title">What People Are Saying</h2>
        </div>
        <div className="testimonial-container">
          {testimonials.map((t, i) => (
            <div 
              key={i} 
              className={`testimonial-card ${i === currentTestimonial ? 'active' : ''}`}
            >
              <p className="testimonial-quote">&ldquo;{t.quote}&rdquo;</p>
              <p className="testimonial-author">— {t.author}, {t.type}</p>
            </div>
          ))}
          <div className="testimonial-dots">
            {testimonials.map((_, i) => (
              <button 
                key={i} 
                className={`dot ${i === currentTestimonial ? 'active' : ''}`}
                onClick={() => setCurrentTestimonial(i)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Selling Houston Podcast */}
      <section className="section podcast-section">
        <div className="podcast">
          <div className="podcast-img">
            <img 
              src="https://media-production.lp-cdn.com/media/pv5ysthrmqr7nujm33le" 
              alt="Selling Houston Podcast"
            />
          </div>
          <div className="podcast-content">
            <p className="section-eyebrow">#SellingHouston</p>
            <h2 className="section-title">Selling Houston Podcast</h2>
            <p className="podcast-text">
              Real estate insights, market updates, and business strategies for agents and investors. 
              Join Courtney as she breaks down what&apos;s happening in Houston and Dallas real estate.
            </p>
            <a href="#" className="btn btn-primary">Listen Now</a>
          </div>
        </div>
      </section>

      {/* Home Valuation CTA */}
      <section className="section">
        <div className="valuation">
          <p className="section-eyebrow">Thinking of Selling?</p>
          <h2 className="valuation-title">What&apos;s Your Home Worth?</h2>
          <p className="valuation-text">
            Get an instant estimate based on recent sales in your neighborhood. 
            Our market analysis gives you the insight you need to make informed decisions.
          </p>
          <div className="valuation-form">
            <input type="text" placeholder="Enter your address..." className="valuation-input" />
            <button className="btn btn-primary">Get My Home Value</button>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="section contact-section">
        <div className="contact-grid">
          <div className="contact-info">
            <p className="section-eyebrow">Get In Touch</p>
            <h2 className="section-title">Let&apos;s Start Your Journey</h2>
            <p className="contact-text">
              Whether you&apos;re ready to buy, sell, or just exploring your options, 
              our team is here to help. Reach out today for a no-obligation consultation.
            </p>
            <div className="contact-details">
              <div className="contact-item">
                <span className="contact-label">Houston Office</span>
                <span className="contact-value">13201 Northwest Fwy Ste 450, Houston TX 77040</span>
              </div>
              <div className="contact-item">
                <span className="contact-label">Dallas Office</span>
                <span className="contact-value">2300 Valley View Ln Ste 518, Irving TX 75062</span>
              </div>
              <div className="contact-item">
                <span className="contact-label">Phone</span>
                <span className="contact-value">(281) 638-9407</span>
              </div>
              <div className="contact-item">
                <span className="contact-label">Email</span>
                <span className="contact-value">info@collectiverealtyco.com</span>
              </div>
            </div>
          </div>
          <div className="contact-form-wrapper">
            <form className="contact-form">
              <div className="form-row">
                <input type="text" placeholder="First Name" />
                <input type="text" placeholder="Last Name" />
              </div>
              <input type="email" placeholder="Email Address" />
              <input type="tel" placeholder="Phone Number" />
              <select defaultValue="">
                <option value="" disabled>I&apos;m interested in...</option>
                <option value="buying">Buying a Home</option>
                <option value="selling">Selling My Home</option>
                <option value="both">Buying &amp; Selling</option>
                <option value="investing">Investment Properties</option>
                <option value="renting">Renting</option>
                <option value="other">Something Else</option>
              </select>
              <textarea placeholder="Tell us about your goals..."></textarea>
              <button type="submit" className="btn btn-primary btn-full">Send Message</button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <img 
              src="https://media-production.lp-cdn.com/media/tfyio0knwbjij9ifmgga" 
              alt="Collective Realty Co."
              className="footer-logo"
            />
            <p className="footer-tagline">
              Houston and Dallas real estate services for buyers, sellers, and investors. 
              Your home journey starts here.
            </p>
            <div className="social-links">
              <a href="#" className="social-link">Instagram</a>
              <a href="#" className="social-link">Facebook</a>
              <a href="#" className="social-link">LinkedIn</a>
              <a href="#" className="social-link">YouTube</a>
            </div>
          </div>
          <div className="footer-col">
            <h4>Buy</h4>
            <a href="#">Houston Metroplex</a>
            <a href="#">DFW Metroplex</a>
            <a href="#">Neighborhoods</a>
            <a href="#">Buyer&apos;s Guide</a>
          </div>
          <div className="footer-col">
            <h4>Sell</h4>
            <a href="#">Home Valuation</a>
            <a href="#">Seller&apos;s Guide</a>
            <a href="#">Book a Consultation</a>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <a href="#">Our Agents</a>
            <a href="#">Join Our Firm</a>
            <a href="#">Selling Houston Podcast</a>
            <a href="#">Contact</a>
          </div>
        </div>
        <div className="footer-legal-links">
          <a href="https://content.harstatic.com/pdf/TREC_CPN.pdf" target="_blank" rel="noopener noreferrer">TREC Consumer Protection Notice</a>
          <a href="https://www.har.com/mhf/terms/dispBrokerInfo?sitetype=aws&amp;cid=870685756" target="_blank" rel="noopener noreferrer">TREC Information About Brokerage Services</a>
        </div>
        <div className="footer-bottom">
          <p>© 2026 Collective Realty Co.  ·  Designated Broker: Courtney Okanlomo  ·  Houston  ·  Dallas</p>
        </div>
      </footer>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Montserrat:wght@300;400;500;600&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        .site {
          font-family: 'Montserrat', sans-serif;
          background: #0a0a0a;
          color: #fff;
          min-height: 100vh;
          --accent: #C5A278;
        }

        /* Navigation */
        .nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          padding: 1rem 4rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
          transition: all 0.3s;
        }
        .nav-scrolled {
          background: rgba(10,10,10,0.95);
          backdrop-filter: blur(10px);
          padding: 0.75rem 4rem;
        }
        .logo-img {
          height: 50px;
          width: auto;
        }
        .nav-scrolled .logo-img {
          height: 40px;
        }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 2.5rem;
        }
        .nav-links a {
          color: rgba(255,255,255,0.8);
          text-decoration: none;
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          transition: color 0.2s;
        }
        .nav-links a:hover {
          color: #fff;
        }
        .nav-cta {
          padding: 0.75rem 1.5rem !important;
          border: 1px solid rgba(255,255,255,0.3) !important;
          color: #fff !important;
        }
        .nav-cta:hover {
          background: #fff !important;
          color: #0a0a0a !important;
          border-color: #fff !important;
        }

        /* Hamburger Menu */
        .hamburger {
          display: none;
          flex-direction: column;
          justify-content: center;
          gap: 5px;
          width: 28px;
          height: 28px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          z-index: 1001;
        }
        .hamburger span {
          display: block;
          width: 100%;
          height: 2px;
          background: #fff;
          transition: all 0.3s;
        }
        .hamburger-open span:nth-child(1) {
          transform: rotate(45deg) translate(5px, 5px);
        }
        .hamburger-open span:nth-child(2) {
          opacity: 0;
        }
        .hamburger-open span:nth-child(3) {
          transform: rotate(-45deg) translate(5px, -5px);
        }

        /* Hero */
        .hero {
          position: relative;
          height: 100vh;
          height: 100svh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .hero-video {
          position: absolute;
          inset: 0;
          background: url('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&q=80') center/cover no-repeat;
        }
        .hero-video video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .hero-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.65));
        }
        .hero-content {
          position: relative;
          z-index: 10;
          text-align: center;
          max-width: 900px;
          padding: 0 2rem;
        }
        .hero-eyebrow {
          font-size: 0.7rem;
          letter-spacing: 0.4em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.7);
          margin-bottom: 2rem;
          font-weight: 500;
        }
        .hero-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 5rem;
          font-weight: 300;
          line-height: 1.1;
          margin-bottom: 1.5rem;
          letter-spacing: 0.02em;
          color: #fff;
        }
        .hero-sub {
          font-size: 1.1rem;
          font-weight: 300;
          color: rgba(255,255,255,0.75);
          max-width: 550px;
          margin: 0 auto 3rem;
          line-height: 1.8;
        }
        .hero-cta {
          display: flex;
          gap: 1rem;
          justify-content: center;
        }
        .btn {
          padding: 1.1rem 2.5rem;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          text-decoration: none;
          transition: all 0.3s;
          cursor: pointer;
          border: none;
          font-family: 'Montserrat', sans-serif;
        }
        .btn-primary {
          background: var(--accent);
          color: #0a0a0a;
        }
        .btn-primary:hover {
          background: #d4b78f;
        }
        .btn-outline {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.35);
          color: #fff;
        }
        .btn-outline:hover {
          border-color: #fff;
          background: rgba(255,255,255,0.05);
        }
        .btn-full {
          width: 100%;
        }
        .scroll-indicator {
          position: absolute;
          bottom: 3rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          opacity: 0.5;
        }
        .scroll-text {
          font-size: 0.6rem;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.7);
        }
        .scroll-line {
          width: 1px;
          height: 50px;
          background: linear-gradient(to bottom, rgba(255,255,255,0.5), transparent);
          animation: scroll 2s infinite;
        }
        @keyframes scroll {
          0%, 100% { opacity: 0; transform: translateY(-10px); }
          50% { opacity: 1; transform: translateY(0); }
        }

        /* Stats */
        .stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          background: #0a0a0a;
          border-top: 1px solid rgba(255,255,255,0.08);
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .stat {
          padding: 4rem 2rem;
          text-align: center;
          border-right: 1px solid rgba(255,255,255,0.06);
        }
        .stat:last-child {
          border-right: none;
        }
        .stat-num {
          font-family: 'Cormorant Garamond', serif;
          font-size: 4rem;
          font-weight: 300;
          color: #fff;
          margin-bottom: 0.5rem;
        }
        .stat-label {
          font-size: 0.65rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }

        /* Sections */
        .section {
          padding: 7rem 4rem;
        }
        .section-header {
          text-align: center;
          margin-bottom: 4rem;
        }
        .section-eyebrow {
          font-size: 0.65rem;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
          margin-bottom: 1rem;
          font-weight: 500;
        }
        .section-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 3rem;
          font-weight: 300;
          color: #fff;
        }
        .section-cta {
          text-align: center;
          margin-top: 3rem;
        }

        /* Listings */
        .listings-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          max-width: 1400px;
          margin: 0 auto;
        }
        .listing {
          position: relative;
          aspect-ratio: 4/3;
          overflow: hidden;
          cursor: pointer;
        }
        .listing-img {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          transition: transform 0.6s;
        }
        .listing:hover .listing-img {
          transform: scale(1.08);
        }
        .listing-badge {
          position: absolute;
          top: 1.25rem;
          left: 1.25rem;
          background: #fff;
          color: #0a0a0a;
          font-size: 0.55rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 0.5rem 1rem;
          z-index: 2;
        }
        .listing-info {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 1.5rem;
          background: linear-gradient(transparent, rgba(0,0,0,0.9));
          transition: opacity 0.3s;
        }
        .listing:hover .listing-info {
          opacity: 0;
        }
        .listing-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 2rem;
          background: linear-gradient(transparent, rgba(0,0,0,0.95));
          transform: translateY(30px);
          opacity: 0;
          transition: all 0.4s;
        }
        .listing:hover .listing-overlay {
          transform: translateY(0);
          opacity: 1;
        }
        .listing-price {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.75rem;
          margin-bottom: 0.4rem;
          color: #fff;
        }
        .listing-addr {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.65);
          margin-bottom: 0.5rem;
        }
        .listing-meta {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.5);
          letter-spacing: 0.1em;
          margin-bottom: 1rem;
        }
        .listing-btn {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.4);
          color: #fff;
          padding: 0.75rem 1.5rem;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Montserrat', sans-serif;
        }
        .listing-btn:hover {
          background: #fff;
          color: #0a0a0a;
          border-color: #fff;
        }

        /* Broker */
        .broker-section {
          background: #0d0d0d;
        }
        .broker {
          display: grid;
          grid-template-columns: 1fr 1.3fr;
          gap: 0;
          max-width: 1200px;
          margin: 0 auto;
          background: #111;
        }
        .broker-img {
          position: relative;
          overflow: hidden;
        }
        .broker-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .broker-content {
          padding: 4rem 5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .broker-eyebrow {
          font-size: 0.65rem;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
          margin-bottom: 1.5rem;
          font-weight: 500;
        }
        .broker-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 2.75rem;
          font-weight: 300;
          margin-bottom: 0.5rem;
          color: #fff;
        }
        .broker-title {
          font-size: 0.75rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
          margin-bottom: 2rem;
        }
        .broker-text {
          font-size: 0.95rem;
          line-height: 1.9;
          color: rgba(255,255,255,0.65);
          margin-bottom: 1.5rem;
          font-weight: 300;
        }
        .broker-content .btn {
          align-self: flex-start;
          margin-top: 1rem;
        }

        /* Neighborhoods */
        .neighborhoods {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          max-width: 1400px;
          margin: 0 auto;
        }
        .neighborhood {
          aspect-ratio: 1;
          background-size: cover;
          background-position: center;
          display: flex;
          align-items: flex-end;
          padding: 1.5rem;
          position: relative;
          cursor: pointer;
          transition: transform 0.3s;
        }
        .neighborhood:hover {
          transform: scale(1.02);
        }
        .neighborhood::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(transparent 40%, rgba(0,0,0,0.85));
        }
        .neighborhood-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.5rem;
          position: relative;
          z-index: 2;
          color: #fff;
        }

        /* Testimonials */
        .testimonials {
          background: #0a0a0a;
          padding: 7rem 4rem;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .testimonial-container {
          max-width: 800px;
          margin: 0 auto;
          position: relative;
          min-height: 200px;
        }
        .testimonial-card {
          position: absolute;
          inset: 0;
          text-align: center;
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.5s;
          pointer-events: none;
        }
        .testimonial-card.active {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .testimonial-quote {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.75rem;
          font-weight: 300;
          font-style: italic;
          line-height: 1.6;
          margin-bottom: 2rem;
          color: rgba(255,255,255,0.85);
        }
        .testimonial-author {
          font-size: 0.75rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.5);
        }
        .testimonial-dots {
          display: flex;
          justify-content: center;
          gap: 0.75rem;
          margin-top: 12rem;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dot.active {
          background: var(--accent);
        }

        /* Podcast */
        .podcast-section {
          background: #0d0d0d;
        }
        .podcast {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          max-width: 1200px;
          margin: 0 auto;
          align-items: center;
        }
        .podcast-img img {
          width: 100%;
          height: auto;
          border-radius: 4px;
        }
        .podcast-text {
          color: rgba(255,255,255,0.65);
          line-height: 1.8;
          margin: 1.5rem 0 2rem;
          font-weight: 300;
        }

        /* Valuation */
        .valuation {
          background: #111;
          text-align: center;
          padding: 5rem;
          border: 1px solid rgba(255,255,255,0.08);
          max-width: 900px;
          margin: 0 auto;
        }
        .valuation-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 2.5rem;
          font-weight: 300;
          margin-bottom: 1rem;
          color: #fff;
        }
        .valuation-text {
          color: rgba(255,255,255,0.55);
          margin-bottom: 2.5rem;
          max-width: 500px;
          margin-left: auto;
          margin-right: auto;
          font-weight: 300;
          line-height: 1.8;
        }
        .valuation-form {
          display: flex;
          gap: 1rem;
          max-width: 600px;
          margin: 0 auto;
        }
        .valuation-input {
          flex: 1;
          padding: 1rem 1.5rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.12);
          color: #fff;
          font-size: 0.9rem;
          font-family: 'Montserrat', sans-serif;
        }
        .valuation-input::placeholder {
          color: rgba(255,255,255,0.35);
        }
        .valuation-input:focus {
          outline: none;
          border-color: rgba(255,255,255,0.3);
        }

        /* Contact */
        .contact-section {
          background: #0a0a0a;
        }
        .contact-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        .contact-info {
          padding-right: 2rem;
        }
        .contact-text {
          color: rgba(255,255,255,0.65);
          line-height: 1.8;
          margin: 1.5rem 0 2.5rem;
          font-weight: 300;
        }
        .contact-details {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .contact-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .contact-label {
          font-size: 0.65rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .contact-value {
          color: rgba(255,255,255,0.75);
          font-weight: 300;
        }
        .contact-form-wrapper {
          background: #111;
          padding: 3rem;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .contact-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        .contact-form input,
        .contact-form select,
        .contact-form textarea {
          padding: 1rem;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.1);
          color: #fff;
          font-size: 0.9rem;
          font-family: 'Montserrat', sans-serif;
          transition: border-color 0.2s;
        }
        .contact-form input:focus,
        .contact-form select:focus,
        .contact-form textarea:focus {
          outline: none;
          border-color: rgba(255,255,255,0.3);
        }
        .contact-form input::placeholder,
        .contact-form textarea::placeholder {
          color: rgba(255,255,255,0.35);
        }
        .contact-form select {
          appearance: none;
          cursor: pointer;
          color: rgba(255,255,255,0.35);
        }
        .contact-form select:valid {
          color: #fff;
        }
        .contact-form textarea {
          min-height: 120px;
          resize: vertical;
        }

        /* Footer */
        .footer {
          padding: 5rem 4rem 2rem;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .footer-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 4rem;
          max-width: 1200px;
          margin: 0 auto 3rem;
        }
        .footer-logo {
          height: 50px;
          width: auto;
          margin-bottom: 1.5rem;
        }
        .footer-tagline {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.45);
          line-height: 1.8;
          font-weight: 300;
          margin-bottom: 2rem;
        }
        .social-links {
          display: flex;
          gap: 1.5rem;
        }
        .social-link {
          font-size: 0.7rem;
          color: rgba(255,255,255,0.45);
          text-decoration: none;
          letter-spacing: 0.1em;
          transition: color 0.2s;
        }
        .social-link:hover {
          color: #fff;
        }
        .footer-col h4 {
          font-size: 0.6rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.5);
          margin-bottom: 1.5rem;
          font-weight: 500;
        }
        .footer-col a {
          display: block;
          color: rgba(255,255,255,0.45);
          text-decoration: none;
          font-size: 0.85rem;
          margin-bottom: 0.75rem;
          font-weight: 300;
          transition: color 0.2s;
        }
        .footer-col a:hover {
          color: #fff;
        }
        .footer-legal-links {
          text-align: center;
          padding: 1.5rem 0;
          border-top: 1px solid rgba(255,255,255,0.05);
          display: flex;
          justify-content: center;
          gap: 2rem;
        }
        .footer-legal-links a {
          font-size: 0.65rem;
          color: rgba(255,255,255,0.3);
          text-decoration: none;
          transition: color 0.2s;
        }
        .footer-legal-links a:hover {
          color: rgba(255,255,255,0.6);
        }
        .footer-bottom {
          text-align: center;
          padding-top: 1.5rem;
        }
        .footer-bottom p {
          font-size: 0.7rem;
          color: rgba(255,255,255,0.25);
          letter-spacing: 0.1em;
        }

        /* Mobile Responsive */
        @media (max-width: 1024px) {
          .nav { padding: 1rem 2rem; }
          .nav-scrolled { padding: 0.75rem 2rem; }
          .nav-links { gap: 1.5rem; }
          .nav-links a { font-size: 0.65rem; }
          .hero-title { font-size: 3.5rem; }
          .stats { grid-template-columns: repeat(2, 1fr); }
          .stat { padding: 3rem 1.5rem; }
          .stat:nth-child(2) { border-right: none; }
          .stat-num { font-size: 3rem; }
          .section { padding: 5rem 2rem; }
          .listings-grid { grid-template-columns: repeat(2, 1fr); gap: 1rem; }
          .broker { grid-template-columns: 1fr; }
          .broker-img { aspect-ratio: 16/9; }
          .broker-content { padding: 3rem; }
          .neighborhoods { grid-template-columns: repeat(2, 1fr); }
          .podcast { grid-template-columns: 1fr; gap: 2rem; }
          .contact-grid { grid-template-columns: 1fr; gap: 3rem; }
          .footer-grid { grid-template-columns: 1fr 1fr; gap: 2rem; }
        }

        @media (max-width: 768px) {
          .nav { padding: 1rem 1.5rem; }
          .hamburger {
            display: flex;
          }
          .nav-links {
            display: flex;
            flex-direction: column;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(10,10,10,0.98);
            justify-content: center;
            align-items: center;
            gap: 2rem;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s;
            z-index: 1000;
          }
          .nav-links.nav-open {
            opacity: 1;
            pointer-events: auto;
          }
          .nav-links a {
            font-size: 1.25rem;
            letter-spacing: 0.2em;
          }
          .nav-links .nav-cta {
            margin-top: 1rem;
            padding: 1rem 2.5rem !important;
          }
          .logo-img { height: 40px; }
          .hero-title { font-size: 2.5rem; }
          .hero-sub { font-size: 0.95rem; }
          .hero-cta { flex-direction: column; gap: 0.75rem; }
          .btn { width: 100%; text-align: center; }
          .stats { grid-template-columns: 1fr 1fr; }
          .stat { padding: 2rem 1rem; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .stat:nth-child(3), .stat:nth-child(4) { border-bottom: none; }
          .stat-num { font-size: 2.5rem; }
          .section-title { font-size: 2rem; }
          .listings-grid { grid-template-columns: 1fr; }
          .listing { aspect-ratio: 16/10; }
          .broker-content { padding: 2rem; }
          .broker-name { font-size: 2rem; }
          .neighborhoods { grid-template-columns: 1fr 1fr; gap: 0.75rem; }
          .neighborhood { aspect-ratio: 4/3; }
          .testimonial-quote { font-size: 1.35rem; }
          .testimonial-dots { margin-top: 10rem; }
          .testimonials { padding: 5rem 2rem; }
          .valuation { padding: 3rem 2rem; }
          .valuation-form { flex-direction: column; }
          .valuation-input { width: 100%; }
          .contact-info { padding-right: 0; }
          .contact-form-wrapper { padding: 2rem; }
          .form-row { grid-template-columns: 1fr; }
          .footer { padding: 3rem 1.5rem 2rem; }
          .footer-grid { grid-template-columns: 1fr; gap: 2rem; text-align: center; }
          .footer-brand { order: -1; }
          .footer-logo { margin: 0 auto 1.5rem; }
          .social-links { justify-content: center; }
          .footer-legal-links { flex-direction: column; gap: 0.75rem; }
        }

        @media (max-width: 480px) {
          .hero { height: 100svh; }
          .hero-content { padding: 0 1.25rem; }
          .hero-eyebrow { font-size: 0.6rem; letter-spacing: 0.3em; }
          .hero-title { font-size: 2rem; }
          .hero-sub { font-size: 0.9rem; margin-bottom: 2rem; }
          .btn { padding: 1rem 1.5rem; font-size: 0.65rem; }
          .scroll-indicator { bottom: 2rem; }
          .stats { grid-template-columns: 1fr 1fr; }
          .stat { padding: 1.5rem 0.75rem; }
          .stat-num { font-size: 2rem; }
          .stat-label { font-size: 0.55rem; }
          .section { padding: 3.5rem 1.25rem; }
          .section-header { margin-bottom: 2.5rem; }
          .section-title { font-size: 1.75rem; }
          .listing-price { font-size: 1.35rem; }
          .listing-addr { font-size: 0.75rem; }
          .broker-name { font-size: 1.75rem; }
          .broker-text { font-size: 0.85rem; }
          .neighborhoods { grid-template-columns: 1fr; }
          .neighborhood { aspect-ratio: 16/9; }
          .neighborhood-name { font-size: 1.25rem; }
          .testimonial-container { min-height: 280px; }
          .testimonial-quote { font-size: 1.15rem; }
          .testimonial-dots { margin-top: 16rem; }
          .valuation-title { font-size: 1.75rem; }
          .contact-form-wrapper { padding: 1.5rem; }
          .footer-col h4 { margin-top: 1rem; }
        }

        /* Ensure video covers on mobile */
        @media (max-width: 768px) {
          .hero-video video {
            object-position: center center;
          }
        }

        /* Safe area for notched phones */
        @supports (padding-top: env(safe-area-inset-top)) {
          .nav {
            padding-top: calc(1rem + env(safe-area-inset-top));
          }
          .footer-bottom {
            padding-bottom: calc(1rem + env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </div>
  );
}
