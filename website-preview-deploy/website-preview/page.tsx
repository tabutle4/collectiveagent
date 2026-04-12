'use client';

import { useState, useEffect, useRef } from 'react';

export default function WebsitePreview() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const [currentVideo, setCurrentVideo] = useState(0);
  const [videoFading, setVideoFading] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [animatedStats, setAnimatedStats] = useState({ years: 0, sold: 0, agents: 0 });
  const [statsVisible, setStatsVisible] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  const videos = [
    'https://5zsj4yo3aszpvnrb.public.blob.vercel-storage.com/1.mp4',
    'https://5zsj4yo3aszpvnrb.public.blob.vercel-storage.com/2.mp4',
    'https://5zsj4yo3aszpvnrb.public.blob.vercel-storage.com/3.mp4',
    'https://5zsj4yo3aszpvnrb.public.blob.vercel-storage.com/4.mp4',
  ];

  // Preload all videos on mount
  useEffect(() => {
    videos.forEach((src) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'video';
      link.href = src;
      document.head.appendChild(link);
    });
  }, []);

  // White logo for dark backgrounds (from Courtney's site footer)
  const whiteLogo = 'https://media-production.lp-cdn.com/media/tfyio0knwbjij9ifmgga';

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Detect mobile for single video loop
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('animate-in'); }),
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !statsVisible) {
          setStatsVisible(true);
          const duration = 2000;
          const steps = 60;
          let step = 0;
          const timer = setInterval(() => {
            step++;
            const progress = step / steps;
            const easeOut = 1 - Math.pow(1 - progress, 3);
            setAnimatedStats({
              years: Math.floor(19 * easeOut),
              sold: Math.floor(40 * easeOut),
              agents: Math.floor(78 * easeOut),
            });
            if (step >= steps) clearInterval(timer);
          }, duration / steps);
        }
      },
      { threshold: 0.5 }
    );
    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, [statsVisible]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTestimonial((prev) => (prev + 1) % testimonials.length), 6000);
    return () => clearInterval(timer);
  }, []);

  // Video ended - advance to next
  const handleVideoEnd = () => {
  if (isMobile) return; // Don't cycle on mobile, let it loop
  setVideoLoaded(false);
  setVideoFading(true);
  setTimeout(() => {
    setCurrentVideo((prev) => (prev + 1) % videos.length);
    setVideoFading(false);
  }, 300);
};

  // Video ready to play
  const handleCanPlay = () => {
    setVideoLoaded(true);
  };

  const listings = [
    { image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/27413120/-3703647671636790085.jpg', price: '$759,800', address: '3103 Lelia Street', city: 'Houston, TX', beds: 3, baths: 3, sqft: '3,458', status: 'Open House' },
    { image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/21154925/-5823161010216405600.jpg', price: '$665,000', address: '936 Brookwood Drive', city: 'Dallas, TX', beds: 4, baths: 4, sqft: '2,994', status: 'For Sale' },
    { image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/88627905/8322605856205348101.jpg', price: '$470,000', address: '11402 Collinsia Lane', city: 'Cypress, TX', beds: 4, baths: 3, sqft: '2,169', status: 'For Sale' },
    { image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/21204937/-6971321241190329174.jpg', price: '$379,900', address: '3224 Sioux Trail', city: 'Crandall, TX', beds: 4, baths: 4, sqft: '2,673', status: 'New Build' },
    { image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/98933377/4714277768199769826.jpg', price: '$349,900', address: '3804 Sayers Street', city: 'Houston, TX', beds: 3, baths: 3, sqft: '1,593', status: 'For Sale' },
    { image: 'https://dlajgvw9htjpb.cloudfront.net/cms/8e615603-6b76-4ed6-ab51-9386ff86d830/21178190/-7239361692667679586.jpg', price: '$245,000', address: '1309 Pennsylvania Ave', city: 'Dallas, TX', beds: 3, baths: 3, sqft: '1,380', status: 'Pending' },
  ];

  const neighborhoods = [
    { name: 'River Oaks', image: 'https://media-production.lp-cdn.com/media/w12r6bpxzyvslncfx4vt', tagline: 'Where Legacy Lives', desc: 'Old-money elegance meets modern luxury' },
    { name: 'The Heights', image: 'https://media-production.lp-cdn.com/media/j4e2upot0p7moxlexbzw', tagline: 'Artfully Urban', desc: 'Historic charm with creative energy' },
    { name: 'Memorial', image: 'https://media-production.lp-cdn.com/media/gunjg851qixw05nqgi2s', tagline: 'Room to Breathe', desc: 'Sprawling estates, top-tier schools' },
    { name: 'Highland Park', image: 'https://media-production.lp-cdn.com/media/vlujbetl2ulsjdhhztps', tagline: 'Dallas Elite', desc: 'The pinnacle of Texas prestige' },
  ];

  const testimonials = [
    { quote: "Courtney doesn't just sell homes—she orchestrates seamless transitions. From the first showing to final signing, every detail was handled with precision and care.", name: 'Twila B.', title: 'First-Time Homebuyer', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop' },
    { quote: "Our home sold in 9 days, $40K over asking. The marketing was stunning and Courtney's negotiation skills are world-class. We couldn't believe the results.", name: 'Eric R.', title: 'Home Seller', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop' },
    { quote: "As an investor acquiring my fifth property, I need an agent who moves fast and understands ROI. Courtney has been instrumental in building my portfolio.", name: 'Moneasia T.', title: 'Real Estate Investor', image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150&h=150&fit=crop' },
  ];

  return (
    <div className="website-preview" style={{ backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
      <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600;700&family=Montserrat:wght@300;400;500;600&display=swap');`}</style>
      <style jsx>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .website-preview { font-family: 'Montserrat', sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; overflow-x: hidden; }
        .reveal { opacity: 1; transform: translateY(0); transition: all 0.9s cubic-bezier(0.16, 1, 0.3, 1); }
        
        /* Header */
        .header { position: fixed; top: 0; left: 0; right: 0; z-index: 1000; padding: 20px 60px; display: flex; justify-content: space-between; align-items: center; transition: all 0.4s; background: ${scrolled ? 'rgba(10,10,10,0.95)' : 'transparent'}; backdrop-filter: ${scrolled ? 'blur(20px)' : 'none'}; }
        .logo img { height: 50px; }
        .nav { display: flex; gap: 40px; align-items: center; }
        .nav a { color: #fff; text-decoration: none; font-size: 12px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; transition: opacity 0.3s; }
        .nav a:hover { opacity: 0.6; }
        .nav a.nav-btn { background: #fff; color: #000 !important; padding: 14px 32px; font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; transition: all 0.3s; }
        .nav a.nav-btn:hover { background: #e0e0e0; opacity: 1; }
        .mobile-menu-btn { display: none; background: none; border: none; color: #fff; font-size: 28px; cursor: pointer; }

        /* Hero */
        .hero { position: relative; height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .hero-video { position: absolute; inset: 0; transition: opacity 0.5s ease-in-out; }
        .hero-video.fading { opacity: 0.3; }
        .hero-video video { width: 100%; height: 100%; object-fit: cover; transform: scale(1.1) translateY(${scrollY * 0.15}px); }
        .video-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #0a0a0a; z-index: 1; transition: opacity 0.5s; }
        .video-loading.hidden { opacity: 0; pointer-events: none; }
        .loading-spinner { width: 40px; height: 40px; border: 1px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .hero-overlay { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.7) 100%); }
        .hero-content { position: relative; z-index: 10; text-align: center; max-width: 1000px; padding: 0 20px; }
        .hero-eyebrow { font-size: 13px; letter-spacing: 5px; text-transform: uppercase; color: rgba(255,255,255,0.7); margin-bottom: 30px; font-weight: 400; }
        .hero-title { font-family: 'Cormorant Garamond', serif; font-size: clamp(48px, 9vw, 90px); font-weight: 300; line-height: 1.05; margin-bottom: 30px; }
        .hero-title span { display: block; }
        .hero-subtitle { font-size: 15px; font-weight: 300; color: rgba(255,255,255,0.7); max-width: 520px; margin: 0 auto 50px; line-height: 1.9; }
        .hero-ctas { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; }
        .hero-cta { display: inline-block; padding: 18px 50px; font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; text-decoration: none; transition: all 0.3s; }
        .hero-cta-primary { background: #fff; color: #000; }
        .hero-cta-primary:hover { background: #e0e0e0; }
        .hero-cta-secondary { border: 1px solid rgba(255,255,255,0.4); color: #fff; }
        .hero-cta-secondary:hover { background: rgba(255,255,255,0.1); border-color: #fff; }
        .video-dots { position: absolute; bottom: 50px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; z-index: 20; }
        @media (max-width: 768px) { .video-dots { display: none; } }  
        .video-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.3); cursor: pointer; transition: all 0.3s; }
        .video-dot.active { background: #C5A278; }
        .scroll-indicator { position: absolute; bottom: 100px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; animation: bounce 2s infinite; }
        .scroll-indicator span { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.4); }
        .scroll-line { width: 1px; height: 30px; background: linear-gradient(to bottom, rgba(255,255,255,0.4), transparent); }
        @keyframes bounce { 0%, 100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(8px); } }

        /* Stats Section */
        .stats-section { padding: 140px 60px; background: #0a0a0a; position: relative; }
        .stats-container { max-width: 1200px; margin: 0 auto; }
        .stats-header { text-align: center; margin-bottom: 80px; }
        .stats-eyebrow { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 20px; }
        .stats-title { font-family: 'Cormorant Garamond', serif; font-size: 42px; font-weight: 400; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }
        .stat-item { text-align: center; padding: 50px 40px; position: relative; }
        .stat-item::after { content: ''; position: absolute; right: 0; top: 50%; transform: translateY(-50%); width: 1px; height: 80px; background: rgba(255,255,255,0.1); }
        .stat-item:last-child::after { display: none; }
        .stat-number { font-family: 'Cormorant Garamond', serif; font-size: 80px; font-weight: 300; color: #fff; line-height: 1; margin-bottom: 15px; }
        .stat-label { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.4); }

        /* Services */
        .services-section { padding: 0; background: #111; }
        .services-grid { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh; }
        .services-content { padding: 100px 80px; display: flex; flex-direction: column; justify-content: center; }
        .services-eyebrow { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 30px; }
        .services-title { font-family: 'Cormorant Garamond', serif; font-size: 48px; font-weight: 400; line-height: 1.2; margin-bottom: 30px; }
        .services-desc { font-size: 16px; color: rgba(255,255,255,0.6); line-height: 1.9; }
        .services-images { display: grid; grid-template-rows: 1fr 1fr; }
        .service-image-box { position: relative; overflow: hidden; }
        .service-image-box img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
        .service-image-box:hover img { transform: scale(1.08); }
        .service-image-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: flex-end; padding: 40px; }
        .service-image-title { font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 400; }
        .services-list { margin-top: 50px; }
        .service-list-item { padding: 25px 0; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.3s; }
        .service-list-item:hover { padding-left: 15px; }
        .service-list-title { font-size: 16px; font-weight: 400; }
        .service-list-arrow { font-size: 18px; color: rgba(255,255,255,0.3); transition: all 0.3s; }
        .service-list-item:hover .service-list-arrow { color: #fff; transform: translateX(5px); }

        /* Broker */
        .broker-section { min-height: 100vh; display: grid; grid-template-columns: 55% 45%; background: #0a0a0a; }
        .broker-image-side { position: relative; overflow: hidden; }
        .broker-image { width: 100%; height: 100%; object-fit: cover; object-position: center top; }
        .broker-content-side { padding: 80px 70px; display: flex; flex-direction: column; justify-content: center; background: #0a0a0a; }
        .broker-eyebrow { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 30px; }
        .broker-name { font-family: 'Cormorant Garamond', serif; font-size: 56px; font-weight: 400; line-height: 1.1; margin-bottom: 15px; }
        .broker-title { font-size: 13px; color: rgba(255,255,255,0.4); margin-bottom: 40px; letter-spacing: 1px; }
        .broker-bio { font-size: 16px; line-height: 1.9; color: rgba(255,255,255,0.6); margin-bottom: 40px; }
        .broker-stats { display: flex; gap: 40px; margin-bottom: 50px; padding: 35px 0; border-top: 1px solid rgba(255,255,255,0.08); border-bottom: 1px solid rgba(255,255,255,0.08); }
        .broker-stat-value { font-family: 'Cormorant Garamond', serif; font-size: 36px; color: #fff; margin-bottom: 6px; }
        .broker-stat-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.4); }
        .broker-btn { display: inline-flex; align-items: center; gap: 12px; background: #fff; color: #000; padding: 18px 40px; font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; text-decoration: none; transition: all 0.3s; align-self: flex-start; }
        .broker-btn:hover { background: #e0e0e0; }

        /* Listings */
        .listings-section { padding: 140px 60px; background: #111; }
        .listings-header { max-width: 1400px; margin: 0 auto 70px; display: flex; justify-content: space-between; align-items: flex-end; }
        .listings-eyebrow { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 15px; }
        .listings-title { font-family: 'Cormorant Garamond', serif; font-size: 48px; font-weight: 400; }
        .listings-grid { max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: repeat(12, 1fr); gap: 25px; }
        .listing-card { position: relative; overflow: hidden; cursor: pointer; }
        .listing-card:nth-child(1) { grid-column: span 7; }
        .listing-card:nth-child(2) { grid-column: span 5; }
        .listing-card:nth-child(3) { grid-column: span 4; }
        .listing-card:nth-child(4) { grid-column: span 4; }
        .listing-card:nth-child(5) { grid-column: span 4; }
        .listing-card:nth-child(6) { grid-column: span 6; }
        .listing-image-wrap { position: relative; height: 450px; overflow: hidden; }
        .listing-card:nth-child(1) .listing-image-wrap { height: 550px; }
        .listing-image { width: 100%; height: 100%; object-fit: cover; transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1); }
        .listing-card:hover .listing-image { transform: scale(1.05); }
        .listing-status { position: absolute; top: 20px; left: 20px; padding: 8px 14px; font-size: 9px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; background: rgba(0,0,0,0.6); backdrop-filter: blur(10px); color: #fff; }
        .listing-hover-info { position: absolute; bottom: 0; left: 0; right: 0; padding: 25px; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); transform: translateY(100%); transition: transform 0.4s; }
        .listing-card:hover .listing-hover-info { transform: translateY(0); }
        .listing-specs { display: flex; gap: 20px; font-size: 12px; color: rgba(255,255,255,0.8); }
        .listing-info { padding: 20px 0; }
        .listing-price { font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 400; margin-bottom: 6px; }
        .listing-address { font-size: 13px; color: rgba(255,255,255,0.5); }
        .view-all-btn { display: inline-flex; align-items: center; gap: 10px; color: #fff; font-size: 12px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; text-decoration: none; transition: gap 0.3s; }
        .view-all-btn:hover { gap: 15px; }

        /* Neighborhoods */
        .neighborhoods-section { padding: 0; }
        .neighborhoods-grid { display: grid; grid-template-columns: repeat(4, 1fr); min-height: 75vh; }
        .neighborhood-card { position: relative; overflow: hidden; cursor: pointer; }
        .neighborhood-card img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.8s, filter 0.4s; filter: grayscale(20%) brightness(0.9); }
        .neighborhood-card:hover img { transform: scale(1.1); filter: grayscale(0%) brightness(1); }
        .neighborhood-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%); display: flex; flex-direction: column; justify-content: flex-end; padding: 45px 35px; }
        .neighborhood-tagline { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 10px; }
        .neighborhood-name { font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 400; margin-bottom: 12px; }
        .neighborhood-desc { font-size: 13px; color: rgba(255,255,255,0.5); transform: translateY(15px); opacity: 0; transition: all 0.4s; }
        .neighborhood-card:hover .neighborhood-desc { transform: translateY(0); opacity: 1; }

        /* Testimonials */
        .testimonials-section { padding: 180px 60px; background: #0a0a0a; position: relative; }
        .testimonials-header { text-align: center; margin-bottom: 70px; }
        .testimonials-eyebrow { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 20px; }
        .testimonials-title { font-family: 'Cormorant Garamond', serif; font-size: 42px; font-weight: 400; }
        .testimonial-container { max-width: 850px; margin: 0 auto; text-align: center; position: relative; min-height: 300px; }
        .testimonial-slide { opacity: 0; transform: translateY(25px); transition: all 0.5s; position: absolute; width: 100%; }
        .testimonial-slide.active { opacity: 1; transform: translateY(0); position: relative; }
        .testimonial-text { font-family: 'Cormorant Garamond', serif; font-size: 30px; font-weight: 300; line-height: 1.7; margin-bottom: 50px; font-style: italic; color: rgba(255,255,255,0.9); }
        .testimonial-author { display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .testimonial-avatar { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; }
        .testimonial-name { font-size: 14px; font-weight: 500; }
        .testimonial-role { font-size: 12px; color: rgba(255,255,255,0.4); }
        .testimonial-dots { display: flex; justify-content: center; gap: 10px; margin-top: 60px; }
        .testimonial-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.2); cursor: pointer; transition: all 0.3s; }
        .testimonial-dot.active { background: #C5A278; }

        /* Podcast */
        .podcast-section { display: grid; grid-template-columns: 1fr 1fr; min-height: 70vh; }
        .podcast-image-side { position: relative; overflow: hidden; }
        .podcast-image-side img { width: 100%; height: 100%; object-fit: cover; }
        .podcast-content-side { background: #111; padding: 80px 70px; display: flex; flex-direction: column; justify-content: center; }
        .podcast-tag { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 25px; }
        .podcast-title { font-family: 'Cormorant Garamond', serif; font-size: 48px; font-weight: 400; margin-bottom: 25px; line-height: 1.2; }
        .podcast-desc { font-size: 15px; line-height: 1.9; color: rgba(255,255,255,0.5); margin-bottom: 40px; }
        .podcast-btn { display: inline-flex; align-items: center; gap: 12px; background: #fff; color: #000; padding: 18px 40px; font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; text-decoration: none; transition: all 0.3s; align-self: flex-start; }
        .podcast-btn:hover { background: #e0e0e0; }

        /* CTA */
        .cta-section { padding: 160px 60px; background: #0a0a0a; text-align: center; }
        .cta-content { max-width: 700px; margin: 0 auto; }
        .cta-title { font-family: 'Cormorant Garamond', serif; font-size: 52px; font-weight: 400; margin-bottom: 25px; line-height: 1.2; }
        .cta-subtitle { font-size: 15px; color: rgba(255,255,255,0.5); margin-bottom: 50px; line-height: 1.8; }
        .cta-form { display: flex; gap: 0; max-width: 550px; margin: 0 auto; }
        .cta-input { flex: 1; padding: 20px 25px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; font-size: 14px; font-family: 'Montserrat', sans-serif; }
        .cta-input::placeholder { color: rgba(255,255,255,0.3); }
        .cta-input:focus { outline: none; border-color: rgba(255,255,255,0.3); }
        .cta-submit { background: #fff; color: #000; padding: 20px 45px; border: none; font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; transition: all 0.3s; }
        .cta-submit:hover { background: #e0e0e0; }

        /* Contact */
        .contact-section { padding: 140px 60px; background: #111; }
        .contact-grid { max-width: 1300px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1.3fr; gap: 100px; }
        .contact-info h3 { font-family: 'Cormorant Garamond', serif; font-size: 46px; font-weight: 400; margin-bottom: 45px; line-height: 1.2; }
        .contact-detail { margin-bottom: 35px; }
        .contact-label { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 10px; }
        .contact-value { font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.6; }
        .contact-form { display: flex; flex-direction: column; gap: 20px; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-input { padding: 18px 0; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.1); color: #fff; font-size: 14px; font-family: 'Montserrat', sans-serif; transition: border-color 0.3s; }
        .form-input:focus { outline: none; border-color: rgba(255,255,255,0.4); }
        .form-input::placeholder { color: rgba(255,255,255,0.3); }
        .form-textarea { height: 100px; resize: none; }
        .form-submit { background: #fff; color: #000; padding: 20px 55px; border: none; font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; transition: all 0.3s; align-self: flex-start; margin-top: 15px; }
        .form-submit:hover { background: #e0e0e0; }

        /* Footer */
        .footer { padding: 80px 60px 45px; background: #050505; }
        .footer-content { max-width: 1300px; margin: 0 auto; display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 50px; margin-bottom: 70px; }
        .footer-brand p { font-size: 14px; color: rgba(255,255,255,0.4); line-height: 1.8; margin-top: 20px; max-width: 280px; }
        .footer-logo img { height: 40px; }
        .footer-col h4 { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 25px; color: rgba(255,255,255,0.8); }
        .footer-col a { display: block; color: rgba(255,255,255,0.4); text-decoration: none; font-size: 13px; margin-bottom: 12px; transition: color 0.3s; }
        .footer-col a:hover { color: #fff; }
        .footer-bottom { max-width: 1300px; margin: 0 auto; padding-top: 40px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; }
        .footer-legal { display: flex; gap: 35px; }
        .footer-legal a { font-size: 11px; color: rgba(255,255,255,0.3); text-decoration: none; }
        .footer-legal a:hover { color: rgba(255,255,255,0.6); }
        .footer-copyright { font-size: 11px; color: rgba(255,255,255,0.3); }

        @media (max-width: 1200px) {
          .broker-section { grid-template-columns: 1fr; }
          .broker-image-side { height: 60vh; }
          .services-grid { grid-template-columns: 1fr; }
          .services-images { min-height: 50vh; }
          .podcast-section { grid-template-columns: 1fr; }
          .podcast-image-side { height: 45vh; }
          .neighborhoods-grid { grid-template-columns: 1fr 1fr; }
          .listings-grid { grid-template-columns: 1fr 1fr; }
          .listing-card:nth-child(n) { grid-column: span 1; }
        }
        @media (max-width: 768px) {
          .header { padding: 15px 25px; }
          .nav { display: none; }
          .mobile-menu-btn { display: block; }
          .hero-ctas { flex-direction: column; align-items: center; }
          .stats-grid { grid-template-columns: 1fr; gap: 30px; }
          .stat-item::after { display: none; }
          .stat-number { font-size: 60px; }
          .broker-content-side, .services-content, .podcast-content-side { padding: 50px 25px; }
          .broker-name { font-size: 40px; }
          .neighborhoods-grid { grid-template-columns: 1fr; }
          .neighborhood-card { min-height: 45vh; }
          .testimonial-text { font-size: 24px; }
          .contact-grid { grid-template-columns: 1fr; gap: 50px; }
          .form-row { grid-template-columns: 1fr; }
          .footer-content { grid-template-columns: 1fr; }
          .footer-bottom { flex-direction: column; gap: 15px; text-align: center; }
          .cta-form { flex-direction: column; }
          .listings-grid { grid-template-columns: 1fr; }
          .listings-section, .stats-section, .testimonials-section, .cta-section, .contact-section { padding: 100px 25px; }
        }
      `}</style>

      <header className="header">
        <a href="/" className="logo"><img src={whiteLogo} alt="Collective Realty Co." /></a>
        <nav className="nav">
          <a href="#listings">Properties</a>
          <a href="#about">About</a>
          <a href="#neighborhoods">Neighborhoods</a>
          <a href="#podcast">Podcast</a>
          <a href="#contact" className="nav-btn">Get in Touch</a>
        </nav>
        <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>{mobileMenuOpen ? '✕' : '☰'}</button>
      </header>

      <section className="hero">
        <div className={`hero-video ${videoFading ? 'fading' : ''}`}>
          <div className={`video-loading ${videoLoaded ? 'hidden' : ''}`}><div className="loading-spinner"></div></div>
          <video
  ref={videoRef}
  key={isMobile ? 'mobile' : currentVideo}
  autoPlay
  muted
  playsInline
  preload="auto"
  loop={isMobile}
  onEnded={isMobile ? undefined : handleVideoEnd}
  onCanPlayThrough={handleCanPlay}
>
  <source src={isMobile ? videos[0] : videos[currentVideo]} type="video/mp4" />
</video>
          {/* Preload next videos in hidden elements */}
          {videos.map((src, i) => i !== currentVideo && (
            <video key={`preload-${i}`} src={src} preload="auto" muted style={{ display: 'none' }} />
          ))}
          <div className="hero-overlay"></div>
        </div>
        <div className="hero-content">
          <p className="hero-eyebrow">Houston & Dallas</p>
          <h1 className="hero-title"><span>Find Your</span><span>Place in Texas</span></h1>
          <p className="hero-subtitle">Where local expertise meets personalized service. We guide you home with care, precision, and an unwavering commitment to your vision.</p>
          <div className="hero-ctas">
            <a href="#listings" className="hero-cta hero-cta-primary">View Properties</a>
            <a href="#cta" className="hero-cta hero-cta-secondary">Get Home Value</a>
          </div>
        </div>
        <div className="scroll-indicator"><span>Scroll</span><div className="scroll-line"></div></div>
        <div className="video-dots">{videos.map((_, i) => <div key={i} className={`video-dot ${currentVideo === i ? 'active' : ''}`} onClick={() => { if (i !== currentVideo) { setVideoLoaded(false); setCurrentVideo(i); } }} />)}</div>
      </section>

      <section className="stats-section reveal" ref={statsRef}>
        <div className="stats-container">
          <div className="stats-header"><p className="stats-eyebrow">Our Track Record</p><h2 className="stats-title">Numbers That Speak</h2></div>
          <div className="stats-grid">
            <div className="stat-item"><div className="stat-number">{animatedStats.years}+</div><div className="stat-label">Years Experience</div></div>
            <div className="stat-item"><div className="stat-number">${animatedStats.sold}M+</div><div className="stat-label">Sales Volume</div></div>
            <div className="stat-item"><div className="stat-number">{animatedStats.agents}+</div><div className="stat-label">Licensed Agents</div></div>
          </div>
        </div>
      </section>

      <section className="services-section reveal">
        <div className="services-grid">
          <div className="services-content">
            <p className="services-eyebrow">What We Do</p>
            <h2 className="services-title">Real Estate,<br />Reimagined</h2>
            <p className="services-desc">We blend deep market expertise with genuine care for your journey. Every transaction is personal, every client is family.</p>
            <div className="services-list">
              <div className="service-list-item"><span className="service-list-title">Buyer Representation</span><span className="service-list-arrow">→</span></div>
              <div className="service-list-item"><span className="service-list-title">Seller Services</span><span className="service-list-arrow">→</span></div>
              <div className="service-list-item"><span className="service-list-title">Investment Advisory</span><span className="service-list-arrow">→</span></div>
              <div className="service-list-item"><span className="service-list-title">Relocation Assistance</span><span className="service-list-arrow">→</span></div>
            </div>
          </div>
          <div className="services-images">
            <div className="service-image-box"><img src="https://media-production.lp-cdn.com/media/swmmojfilvqrjnzjw9id" alt="Buying" /><div className="service-image-overlay"><span className="service-image-title">For Buyers</span></div></div>
            <div className="service-image-box"><img src="https://media-production.lp-cdn.com/media/shrvs4ez86qk8yvq2z1l" alt="Selling" /><div className="service-image-overlay"><span className="service-image-title">For Sellers</span></div></div>
          </div>
        </div>
      </section>

      <section className="broker-section reveal" id="about">
        <div className="broker-image-side"><img className="broker-image" src="https://media-production.lp-cdn.com/media/efe6ba81-3dae-4ae0-9784-5b6bbfd04f9f" alt="Courtney Okanlomo" /></div>
        <div className="broker-content-side">
          <p className="broker-eyebrow">The Broker</p>
          <h2 className="broker-name">Courtney<br />Okanlomo</h2>
          <p className="broker-title">Founder & Principal Broker</p>
          <p className="broker-bio">With nearly two decades navigating Houston and Dallas real estate, I&apos;ve built Collective Realty on a simple premise: every client deserves an advocate who treats their goals as their own. My DePaul marketing background meets boots-on-the-ground Texas expertise.</p>
          <div className="broker-stats">
            <div><div className="broker-stat-value">19+</div><div className="broker-stat-label">Years</div></div>
            <div><div className="broker-stat-value">$40M+</div><div className="broker-stat-label">Closed</div></div>
            <div><div className="broker-stat-value">78+</div><div className="broker-stat-label">Agents</div></div>
          </div>
          <a href="#contact" className="broker-btn">Work With Me →</a>
        </div>
      </section>

      <section className="listings-section reveal" id="listings">
        <div className="listings-header">
          <div><p className="listings-eyebrow">Featured</p><h2 className="listings-title">Properties</h2></div>
          <a href="#" className="view-all-btn">View All →</a>
        </div>
        <div className="listings-grid">
          {listings.map((l, i) => (
            <div key={i} className="listing-card">
              <div className="listing-image-wrap"><img className="listing-image" src={l.image} alt={l.address} /><div className="listing-status">{l.status}</div><div className="listing-hover-info"><div className="listing-specs"><span>{l.beds} Bed</span><span>{l.baths} Bath</span><span>{l.sqft} SF</span></div></div></div>
              <div className="listing-info"><div className="listing-price">{l.price}</div><div className="listing-address">{l.address}, {l.city}</div></div>
            </div>
          ))}
        </div>
      </section>

      <section className="neighborhoods-section reveal" id="neighborhoods">
        <div className="neighborhoods-grid">
          {neighborhoods.map((n, i) => (
            <div key={i} className="neighborhood-card"><img src={n.image} alt={n.name} /><div className="neighborhood-overlay"><span className="neighborhood-tagline">{n.tagline}</span><h3 className="neighborhood-name">{n.name}</h3><p className="neighborhood-desc">{n.desc}</p></div></div>
          ))}
        </div>
      </section>

      <section className="testimonials-section reveal">
        <div className="testimonials-header"><p className="testimonials-eyebrow">Testimonials</p><h2 className="testimonials-title">Client Stories</h2></div>
        <div className="testimonial-container">
          {testimonials.map((t, i) => (
            <div key={i} className={`testimonial-slide ${currentTestimonial === i ? 'active' : ''}`}>
              <p className="testimonial-text">&ldquo;{t.quote}&rdquo;</p>
              <div className="testimonial-author"><img className="testimonial-avatar" src={t.image} alt={t.name} /><span className="testimonial-name">{t.name}</span><span className="testimonial-role">{t.title}</span></div>
            </div>
          ))}
          <div className="testimonial-dots">{testimonials.map((_, i) => <div key={i} className={`testimonial-dot ${currentTestimonial === i ? 'active' : ''}`} onClick={() => setCurrentTestimonial(i)} />)}</div>
        </div>
      </section>

      <section className="podcast-section reveal" id="podcast">
        <div className="podcast-image-side"><img src="https://media-production.lp-cdn.com/media/pv5ysthrmqr7nujm33le" alt="Selling Houston" /></div>
        <div className="podcast-content-side">
          <div className="podcast-tag">Podcast</div>
          <h2 className="podcast-title">Selling Houston</h2>
          <p className="podcast-desc">Join Courtney as she unpacks the Texas real estate market, interviews industry leaders, and shares the strategies that drive results. New episodes weekly.</p>
          <a href="#" className="podcast-btn">▶ Listen Now</a>
        </div>
      </section>

      <section className="cta-section reveal">
        <div className="cta-content">
          <h2 className="cta-title">What&apos;s Your<br />Home Worth?</h2>
          <p className="cta-subtitle">Get a free, instant property valuation based on recent market data and comparable sales in your neighborhood.</p>
          <div className="cta-form"><input className="cta-input" type="text" placeholder="Enter your property address" /><button className="cta-submit">Get Value</button></div>
        </div>
      </section>

      <section className="contact-section reveal" id="contact">
        <div className="contact-grid">
          <div className="contact-info">
            <h3>Let&apos;s Start<br />Your Journey</h3>
            <div className="contact-detail"><div className="contact-label">Houston</div><div className="contact-value">13201 Northwest Fwy Ste 450<br />Houston, TX 77040</div></div>
            <div className="contact-detail"><div className="contact-label">Dallas</div><div className="contact-value">2300 Valley View Ln Ste 518<br />Irving, TX 75062</div></div>
            <div className="contact-detail"><div className="contact-label">Direct</div><div className="contact-value">(281) 638-9407</div></div>
          </div>
          <form className="contact-form">
            <div className="form-row"><input className="form-input" type="text" placeholder="First Name" /><input className="form-input" type="text" placeholder="Last Name" /></div>
            <input className="form-input" type="email" placeholder="Email" />
            <input className="form-input" type="tel" placeholder="Phone" />
            <textarea className="form-input form-textarea" placeholder="Tell us about your goals..."></textarea>
            <button type="submit" className="form-submit">Send Message</button>
          </form>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand"><div className="footer-logo"><img src={whiteLogo} alt="CRC" /></div><p>Your trusted partner in Texas real estate.</p></div>
          <div className="footer-col"><h4>Explore</h4><a href="#">Properties</a><a href="#">Neighborhoods</a><a href="#">Sell</a><a href="#">Buy</a></div>
          <div className="footer-col"><h4>Company</h4><a href="#">About</a><a href="#">Agents</a><a href="#">Careers</a><a href="#">Blog</a></div>
          <div className="footer-col"><h4>Connect</h4><a href="#">Instagram</a><a href="#">LinkedIn</a><a href="#">Podcast</a><a href="#">Contact</a></div>
        </div>
        <div className="footer-bottom">
          <div className="footer-legal"><a href="#">TREC Notice</a><a href="#">Privacy</a><a href="#">Terms</a></div>
          <p className="footer-copyright">© 2026 Collective Realty Co.</p>
        </div>
      </footer>
    </div>
  );
}
