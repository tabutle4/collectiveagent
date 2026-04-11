'use client';

import { useState, useEffect } from 'react';

export default function WebsitePreview() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const listings = [
    {
      image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
      price: '$1,850,000',
      address: '4521 River Oaks Blvd',
      city: 'Houston',
      beds: 5,
      baths: 4,
      sqft: '4,200',
      badge: 'For Sale'
    },
    {
      image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
      price: '$2,450,000',
      address: '1820 Preston Hollow',
      city: 'Dallas',
      beds: 6,
      baths: 5,
      sqft: '5,800',
      badge: 'For Sale'
    },
    {
      image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80',
      price: '$975,000',
      address: '9012 Memorial Park',
      city: 'Houston',
      beds: 4,
      baths: 3,
      sqft: '3,100',
      badge: 'New Listing'
    },
    {
      image: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800&q=80',
      price: '$1,275,000',
      address: '3847 Highland Park',
      city: 'Dallas',
      beds: 4,
      baths: 4,
      sqft: '3,600',
      badge: 'For Sale'
    },
    {
      image: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80',
      price: '$2,100,000',
      address: '7234 Tanglewood',
      city: 'Houston',
      beds: 5,
      baths: 5,
      sqft: '4,800',
      badge: 'Price Reduced'
    },
    {
      image: 'https://images.unsplash.com/photo-1600573472591-ee6c8e695481?w=800&q=80',
      price: '$895,000',
      address: '2156 University Park',
      city: 'Dallas',
      beds: 3,
      baths: 3,
      sqft: '2,800',
      badge: 'Open House'
    }
  ];

  const neighborhoods = [
    { name: 'River Oaks', image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=80' },
    { name: 'The Heights', image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=600&q=80' },
    { name: 'Preston Hollow', image: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=600&q=80' },
    { name: 'Highland Park', image: 'https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=600&q=80' },
  ];

  const testimonials = [
    {
      quote: "They made what could have been an overwhelming process feel seamless. From our first conversation to closing, we felt like the only client that mattered.",
      author: "First-Time Buyer",
      location: "Houston"
    },
    {
      quote: "Courtney and her team went above and beyond. Their knowledge of the Dallas market is unmatched, and their negotiation skills got us $50K under asking.",
      author: "Relocating Family",
      location: "Dallas"
    },
    {
      quote: "As investors, we've worked with dozens of agents. Collective Realty stands out for their professionalism, market insight, and genuine care for their clients.",
      author: "Real Estate Investor",
      location: "Houston"
    }
  ];

  const [currentTestimonial, setCurrentTestimonial] = useState(0);

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
          <span className="logo-main">COLLECTIVE</span>
          <span className="logo-sub">REALTY CO.</span>
        </div>
        <div className="nav-links">
          <a href="#">Buy</a>
          <a href="#">Sell</a>
          <a href="#">Agents</a>
          <a href="#">Neighborhoods</a>
          <a href="#">About</a>
          <a href="#" className="nav-cta">Contact</a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-video">
          <video autoPlay muted loop playsInline>
            <source src="https://videos.pexels.com/video-files/3773486/3773486-uhd_2560_1440_30fps.mp4" type="video/mp4" />
          </video>
          <div className="hero-overlay"></div>
        </div>
        <div className="hero-content">
          <p className="hero-eyebrow">Houston & Dallas Luxury Real Estate</p>
          <h1 className="hero-title">Find Your <span>Forever</span> in Texas</h1>
          <p className="hero-sub">Exceptional homes deserve exceptional representation. We guide families through the most significant purchases of their lives.</p>
          <div className="hero-cta">
            <a href="#" className="btn btn-primary">Search Homes</a>
            <a href="#" className="btn btn-outline">What&apos;s Your Home Worth?</a>
          </div>
        </div>
        <div className="scroll-indicator">
          <span className="scroll-text">Scroll</span>
          <div className="scroll-line"></div>
        </div>
      </section>

      {/* Press Bar */}
      <div className="press-bar">
        <span className="press-item">Houston Chronicle</span>
        <span className="press-item">D Magazine</span>
        <span className="press-item">CultureMap</span>
        <span className="press-item">PaperCity</span>
        <span className="press-item">Texas Monthly</span>
      </div>

      {/* Stats Section */}
      <div className="stats">
        <div className="stat">
          <div className="stat-num">$85M+</div>
          <div className="stat-label">Sales Volume 2025</div>
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

      {/* Featured Listings */}
      <section className="section">
        <div className="section-header">
          <p className="section-eyebrow">Featured Properties</p>
          <h2 className="section-title">Newest Listings</h2>
        </div>
        <div className="listings-grid">
          {listings.map((listing, i) => (
            <div key={i} className="listing">
              <div className="listing-img" style={{ backgroundImage: `url(${listing.image})` }}></div>
              <span className="listing-badge">{listing.badge}</span>
              <div className="listing-info">
                <div className="listing-price">{listing.price}</div>
                <div className="listing-addr">{listing.address}, {listing.city}</div>
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

      {/* Broker Section */}
      <section className="section broker-section">
        <div className="broker">
          <div className="broker-img">
            <img 
              src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&q=80" 
              alt="Courtney Okanlomo"
            />
          </div>
          <div className="broker-content">
            <p className="broker-eyebrow">Meet Your Broker</p>
            <h2 className="broker-name">Courtney Okanlomo</h2>
            <p className="broker-title">Broker / Owner</p>
            <p className="broker-text">
              With a decade of experience and a passion for client success, Courtney founded Collective Realty Co. 
              to redefine what Texas families expect from their real estate experience. Her brokerage combines 
              boutique attention with the reach of a major firm—78 agents strong across Houston and Dallas.
            </p>
            <p className="broker-text">
              Whether you&apos;re buying your first home, selling a luxury estate, or building an investment portfolio, 
              Courtney and her team bring the expertise, negotiation skills, and market knowledge to exceed your expectations.
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
          <p className="section-eyebrow">Client Stories</p>
          <h2 className="section-title">What Our Clients Say</h2>
        </div>
        <div className="testimonial-container">
          {testimonials.map((t, i) => (
            <div 
              key={i} 
              className={`testimonial-card ${i === currentTestimonial ? 'active' : ''}`}
            >
              <p className="testimonial-quote">&ldquo;{t.quote}&rdquo;</p>
              <p className="testimonial-author">— {t.author}, {t.location}</p>
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

      {/* Home Valuation CTA */}
      <section className="section">
        <div className="valuation">
          <p className="section-eyebrow">Thinking of Selling?</p>
          <h2 className="valuation-title">What&apos;s Your Home Worth?</h2>
          <p className="valuation-text">
            Get an instant estimate based on recent sales in your neighborhood. 
            Our market analysis is powered by real MLS data, not algorithms.
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
                <span className="contact-value">1234 Westheimer Rd, Houston, TX 77006</span>
              </div>
              <div className="contact-item">
                <span className="contact-label">Dallas Office</span>
                <span className="contact-value">5678 Preston Rd, Dallas, TX 75205</span>
              </div>
              <div className="contact-item">
                <span className="contact-label">Phone</span>
                <span className="contact-value">(713) 555-0123</span>
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
              <select>
                <option value="">I&apos;m interested in...</option>
                <option value="buying">Buying a Home</option>
                <option value="selling">Selling My Home</option>
                <option value="both">Buying & Selling</option>
                <option value="investing">Investment Properties</option>
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
            <div className="logo">
              <span className="logo-main">COLLECTIVE</span>
              <span className="logo-sub">REALTY CO.</span>
            </div>
            <p className="footer-tagline">
              Luxury real estate services across Houston and Dallas. 
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
            <a href="#">Search Homes</a>
            <a href="#">New Listings</a>
            <a href="#">Open Houses</a>
            <a href="#">Neighborhoods</a>
            <a href="#">Market Reports</a>
          </div>
          <div className="footer-col">
            <h4>Sell</h4>
            <a href="#">Home Valuation</a>
            <a href="#">Selling Process</a>
            <a href="#">Staging Tips</a>
            <a href="#">Pricing Strategy</a>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <a href="#">Our Agents</a>
            <a href="#">Join Our Team</a>
            <a href="#">About Us</a>
            <a href="#">Careers</a>
            <a href="#">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 Collective Realty Co.  ·  Houston  ·  Dallas  ·  All Rights Reserved</p>
          <p className="footer-legal">
            <a href="#">Privacy Policy</a>  ·  <a href="#">Terms of Service</a>  ·  <a href="#">TREC Consumer Protection Notice</a>
          </p>
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
        }

        /* Navigation */
        .nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          padding: 1.5rem 4rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
          transition: all 0.3s;
        }
        .nav-scrolled {
          background: rgba(10,10,10,0.95);
          backdrop-filter: blur(10px);
          padding: 1rem 4rem;
        }
        .logo {
          display: flex;
          flex-direction: column;
        }
        .logo-main {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.6rem;
          font-weight: 500;
          letter-spacing: 0.15em;
          color: #C5A572;
        }
        .logo-sub {
          font-size: 0.6rem;
          letter-spacing: 0.35em;
          color: rgba(255,255,255,0.5);
          margin-top: 2px;
        }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 2.5rem;
        }
        .nav-links a {
          color: #fff;
          text-decoration: none;
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          transition: color 0.2s;
        }
        .nav-links a:hover {
          color: #C5A572;
        }
        .nav-cta {
          padding: 0.75rem 1.5rem;
          border: 1px solid #C5A572 !important;
          color: #C5A572 !important;
        }
        .nav-cta:hover {
          background: #C5A572 !important;
          color: #0a0a0a !important;
        }

        /* Hero */
        .hero {
          position: relative;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .hero-video {
          position: absolute;
          inset: 0;
        }
        .hero-video video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .hero-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.6));
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
          color: #C5A572;
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
        }
        .hero-title span {
          font-style: italic;
          color: #C5A572;
        }
        .hero-sub {
          font-size: 1.1rem;
          font-weight: 300;
          color: rgba(255,255,255,0.8);
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
          background: #C5A572;
          color: #0a0a0a;
        }
        .btn-primary:hover {
          background: #D4BC8A;
        }
        .btn-outline {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.4);
          color: #fff;
        }
        .btn-outline:hover {
          border-color: #C5A572;
          color: #C5A572;
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
          opacity: 0.6;
        }
        .scroll-text {
          font-size: 0.6rem;
          letter-spacing: 0.3em;
          text-transform: uppercase;
        }
        .scroll-line {
          width: 1px;
          height: 50px;
          background: linear-gradient(to bottom, #C5A572, transparent);
          animation: scroll 2s infinite;
        }
        @keyframes scroll {
          0%, 100% { opacity: 0; transform: translateY(-10px); }
          50% { opacity: 1; transform: translateY(0); }
        }

        /* Press Bar */
        .press-bar {
          background: #111;
          border-top: 1px solid rgba(197,165,114,0.15);
          border-bottom: 1px solid rgba(197,165,114,0.15);
          padding: 2rem 4rem;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 5rem;
        }
        .press-item {
          font-size: 0.65rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          font-weight: 500;
        }

        /* Stats */
        .stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          background: linear-gradient(90deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%);
        }
        .stat {
          padding: 4rem 2rem;
          text-align: center;
          border-right: 1px solid rgba(197,165,114,0.1);
        }
        .stat:last-child {
          border-right: none;
        }
        .stat-num {
          font-family: 'Cormorant Garamond', serif;
          font-size: 4rem;
          font-weight: 300;
          color: #C5A572;
          margin-bottom: 0.5rem;
        }
        .stat-label {
          font-size: 0.65rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.5);
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
          color: #C5A572;
          margin-bottom: 1rem;
          font-weight: 500;
        }
        .section-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 3rem;
          font-weight: 300;
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
          background: #C5A572;
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
        }
        .listing-addr {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.7);
          margin-bottom: 0.5rem;
        }
        .listing-meta {
          font-size: 0.75rem;
          color: #C5A572;
          letter-spacing: 0.1em;
          margin-bottom: 1rem;
        }
        .listing-btn {
          background: transparent;
          border: 1px solid #C5A572;
          color: #C5A572;
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
          background: #C5A572;
          color: #0a0a0a;
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
          color: #C5A572;
          margin-bottom: 1.5rem;
          font-weight: 500;
        }
        .broker-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 2.75rem;
          font-weight: 300;
          margin-bottom: 0.5rem;
        }
        .broker-title {
          font-size: 0.75rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.5);
          margin-bottom: 2rem;
        }
        .broker-text {
          font-size: 0.95rem;
          line-height: 1.9;
          color: rgba(255,255,255,0.7);
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
        }

        /* Testimonials */
        .testimonials {
          background: linear-gradient(to right, #0d0d0d, #0a0a0a, #0d0d0d);
          padding: 7rem 4rem;
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
          color: rgba(255,255,255,0.9);
        }
        .testimonial-author {
          font-size: 0.75rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #C5A572;
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
          background: #C5A572;
        }

        /* Valuation */
        .valuation {
          background: linear-gradient(135deg, #1a1815 0%, #0d0d0d 100%);
          text-align: center;
          padding: 5rem;
          border: 1px solid rgba(197,165,114,0.15);
          max-width: 900px;
          margin: 0 auto;
        }
        .valuation-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 2.5rem;
          font-weight: 300;
          margin-bottom: 1rem;
        }
        .valuation-text {
          color: rgba(255,255,255,0.6);
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
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: #fff;
          font-size: 0.9rem;
          font-family: 'Montserrat', sans-serif;
        }
        .valuation-input::placeholder {
          color: rgba(255,255,255,0.4);
        }

        /* Contact */
        .contact-section {
          background: #0d0d0d;
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
          color: rgba(255,255,255,0.7);
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
          color: #C5A572;
        }
        .contact-value {
          color: rgba(255,255,255,0.8);
          font-weight: 300;
        }
        .contact-form-wrapper {
          background: #111;
          padding: 3rem;
          border: 1px solid rgba(197,165,114,0.1);
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
          background: rgba(255,255,255,0.03);
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
          border-color: #C5A572;
        }
        .contact-form input::placeholder,
        .contact-form textarea::placeholder {
          color: rgba(255,255,255,0.4);
        }
        .contact-form select {
          appearance: none;
          cursor: pointer;
        }
        .contact-form textarea {
          min-height: 120px;
          resize: vertical;
        }

        /* Footer */
        .footer {
          padding: 5rem 4rem 2rem;
          border-top: 1px solid rgba(197,165,114,0.1);
          margin-top: 0;
        }
        .footer-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 4rem;
          max-width: 1200px;
          margin: 0 auto 4rem;
        }
        .footer-brand .logo {
          margin-bottom: 1.5rem;
        }
        .footer-tagline {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.5);
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
          color: rgba(255,255,255,0.5);
          text-decoration: none;
          letter-spacing: 0.1em;
          transition: color 0.2s;
        }
        .social-link:hover {
          color: #C5A572;
        }
        .footer-col h4 {
          font-size: 0.6rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #C5A572;
          margin-bottom: 1.5rem;
          font-weight: 500;
        }
        .footer-col a {
          display: block;
          color: rgba(255,255,255,0.5);
          text-decoration: none;
          font-size: 0.85rem;
          margin-bottom: 0.75rem;
          font-weight: 300;
          transition: color 0.2s;
        }
        .footer-col a:hover {
          color: #C5A572;
        }
        .footer-bottom {
          text-align: center;
          padding-top: 2rem;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .footer-bottom p {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.1em;
          margin-bottom: 0.75rem;
        }
        .footer-legal a {
          color: rgba(255,255,255,0.3);
          text-decoration: none;
          transition: color 0.2s;
        }
        .footer-legal a:hover {
          color: #C5A572;
        }
      `}</style>
    </div>
  );
}
