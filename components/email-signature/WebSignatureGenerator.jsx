"use client";

import { supabase } from "@/lib/supabase";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Cropper from "react-easy-crop";

import { removeBackground } from "@imgly/background-removal";

// Supabase Environment Variables Configuration
// Required environment variables:
// - NEXT_PUBLIC_SUPABASE_URL: Your Supabase project URL
// - NEXT_PUBLIC_SUPABASE_ANON_KEY: Your Supabase anonymous/public key
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Validate Supabase configuration
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  if (typeof window !== 'undefined') {
    console.error(
      "❌ Supabase configuration missing!\n" +
      "Please ensure the following environment variables are set:\n" +
      "- NEXT_PUBLIC_SUPABASE_URL\n" +
      "- NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
}

// Supabase Storage Configuration
// Social icons are stored in the public-assets bucket
const STORAGE_BASE_URL = 
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_URL ||
  (SUPABASE_URL 
    ? `${SUPABASE_URL}/storage/v1/object/public/public-assets`
    : "");

// Image Cropping Modal Component
function ImageCropModal({ 
  imageSrc, 
  onClose, 
  onCropComplete, 
  cropType, 
  aspectRatio = 1,
  outputSize = { width: 300, height: 300 },
  circular = false 
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropChange = (crop) => {
    setCrop(crop);
  };

  const onZoomChange = (zoom) => {
    setZoom(zoom);
  };

  const onCropCompleteCallback = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleApply = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels, outputSize, circular, cropType);
      onCropComplete(croppedImage);
      onClose();
    } catch (error) {
      // Production-ready error handling
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      if (process.env.NODE_ENV === 'development') {
        console.error("Error cropping image:", error);
      }
      alert(`Failed to crop image: ${errorMessage}`);
    }
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px"
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#fff",
          borderRadius: "8px",
          padding: "24px",
          maxWidth: "90vw",
          maxHeight: "90vh",
          overflow: "auto",
          position: "relative"
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px", fontWeight: 600 }}>
          Crop Image
        </h3>
        <p style={{ fontSize: "13px", color: "#666", marginBottom: "16px" }}>
          Drag to reposition, use corners to resize, zoom slider to adjust
        </p>
               <p style={{ fontSize: "12px", color: "#999", marginBottom: "16px", fontWeight: 600 }}>
                 Crop Size: {outputSize.width} × {outputSize.height} px
                 {cropType === "photo" && " (Output: 1200 × 1200 px)"}
                 {cropType === "cta" && " (Output: 600 × 120 px)"}
                 {cropType === "logo" && " (Output: 360 × 360 px)"}
               </p>
        <div style={{
          position: "relative",
          width: "100%",
          minWidth: "300px",
          height: "400px",
          background: "#333",
          marginBottom: "16px",
          userSelect: "none",
          touchAction: "none"
        }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspectRatio}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropCompleteCallback}
            cropShape={circular ? "round" : "rect"}
            restrictPosition={false}
            maxZoom={3}
            cropSize={{ width: outputSize.width, height: outputSize.height }}
          />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 600 }}>
            Zoom: {Math.round(zoom * 100)}%
          </label>
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              background: "#e0e0e0",
              color: "#000",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: "10px 20px",
              background: "#e0e0e0",
              color: "#000",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600
            }}
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            style={{
              padding: "10px 20px",
              background: "#000",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper function to create cropped image with maximum quality
async function getCroppedImg(imageSrc, pixelCrop, outputSize, circular = false, imageType = "photo") {
  const image = await createImage(imageSrc);
  
  // Determine resolution multiplier based on image type
  // Profile Photo: 4x (1200x1200px output, displayed at 300x300px)
  // CTA Banner: 2x (600x120px output, displayed at 300x60px)
  // Logo: 4x (360x360px output, displayed at 90x90px)
  let resolutionMultiplier;
  if (imageType === "photo") {
    resolutionMultiplier = 4; // 300 * 4 = 1200px
  } else if (imageType === "cta") {
    resolutionMultiplier = 2; // 300 * 2 = 600px, 60 * 2 = 120px
  } else if (imageType === "logo") {
    resolutionMultiplier = 4; // 90 * 4 = 360px
  } else {
    resolutionMultiplier = 2; // Default
  }
  
  const highResWidth = outputSize.width * resolutionMultiplier;
  const highResHeight = outputSize.height * resolutionMultiplier;
  
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { 
    alpha: true,
    willReadFrequently: false 
  });

  canvas.width = highResWidth;
  canvas.height = highResHeight;

  // Scale context to match high resolution
  ctx.scale(resolutionMultiplier, resolutionMultiplier);

  // Best quality settings
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (circular) {
    // For circular crops, add smooth anti-aliasing
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0.5;
    
    ctx.beginPath();
    ctx.arc(outputSize.width / 2, outputSize.height / 2, outputSize.width / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  }

  // Draw the cropped area at high resolution
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize.width,
    outputSize.height
  );

  return new Promise((resolve) => {
    // Always use PNG for all image types to preserve transparency
    // PNG supports transparency and is lossless, which is important for CTA banners with transparent backgrounds
    canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.src = url;
  });
}

export default function WebSignatureGenerator() {
  // Validate Supabase connection on mount (production-ready)
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return; // Configuration validation already logged
    }

    // Silently test Supabase connection
    (async () => {
      try {
        const { error } = await supabase.auth.getSession();
        if (error && process.env.NODE_ENV === 'development') {
          console.warn("Supabase connection warning:", error.message);
        }
      } catch (error) {
        // Fail silently in production, log in development only
        if (process.env.NODE_ENV === 'development') {
          console.error("Supabase connection error:", error);
        }
      }
    })();
  }, []);

  // Load saved data from localStorage on mount
  const loadSavedData = () => {
    try {
      if (typeof window === 'undefined') return null;
      const saved = localStorage.getItem("signatureGeneratorData");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      // Fail silently in production, log in development only
      if (process.env.NODE_ENV === 'development') {
        console.error("Error loading saved data:", error);
      }
      // Clear potentially corrupted data
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem("signatureGeneratorData");
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    return null;
  };

  const savedData = loadSavedData();
  
  // Check if on mobile device and default to mobile layout, otherwise default to classic
  const getInitialLayout = () => {
    if (typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        return "mobile";
      }
    }
    // On desktop, default to classic if no saved preference
    return savedData?.signatureLayout || "classic";
  };
  
  const [signatureLayout, setSignatureLayout] = useState(() => {
    // Always default to classic on initial load, then let useEffect handle mobile detection
    return savedData?.signatureLayout || "classic";
  }); // "classic", "stacked", "noLogo", "mobile"
  const [signatureType, setSignatureType] = useState(savedData?.signatureType || "with-photo"); // Keep for backward compatibility
  const [activeTab, setActiveTab] = useState("personal"); // "personal", "company", "address", "social", "links"
  const [ctaImageUrl, setCtaImageUrl] = useState(savedData?.ctaImageUrl || "");
  const [ctaLink, setCtaLink] = useState(savedData?.ctaLink || "");
  const [borderColor, setBorderColor] = useState(savedData?.borderColor || "#000000");
  const [showBorder, setShowBorder] = useState(true); // Always default to true (show border) on page load
  const [formData, setFormData] = useState(savedData?.formData || {
    name: "",
    title: "",
    mobile: "",
    email: "",
    website: "",
    companyName: "Collective Realty Co.",
    officePhone: "(281) 638-9407",
    officeFax: "(281) 516-5806",
    selectedOffice: "",
    instagram: "",
    facebook: "",
    linkedin: "",
    twitter: "",
    youtube: "",
    tiktok: "",
    threads: "",
    includeLink1: false,
    linkText1: "",
    linkUrl1: "",
    includeLink2: false,
    linkText2: "",
    linkUrl2: "",
  });
  const [previewHtml, setPreviewHtml] = useState("");
  const [copyStatus, setCopyStatus] = useState(false);
  const [savingToAccount, setSavingToAccount] = useState(false);
  const [accountSaveStatus, setAccountSaveStatus] = useState(null); // 'saved' | 'error' | null
  const [loadedFromAccount, setLoadedFromAccount] = useState(false);
  const [officeData, setOfficeData] = useState(null); // { houston, irving, referral, crc } from API
  const fileInputRef = useRef(null);
  const ctaInputRef = useRef(null);
  const logoInputRef = useRef(null);
  // CRC logo URLs - default logos for Collective Realty Co.
  const CRC_LOGO_URL = `${STORAGE_BASE_URL}/867efbb15_crc6copy.png`;
  const CRC_LOGO_CIRCLE_URL = `${STORAGE_BASE_URL}/crc-logo-circle_4.png`; // For classic layout only
  
  const [photoUrl, setPhotoUrl] = useState(savedData?.photoUrl || "");
  const [photoUrlSquare, setPhotoUrlSquare] = useState(savedData?.photoUrlSquare || "");
  // Use saved logo if it exists and is not empty, otherwise use CRC logo as default
  // logoUrl is for classic layout (circular) - use the circle logo
  // logoUrlSquare is for stacked/no-logo layouts (square) - use the regular logo
  const [logoUrl, setLogoUrl] = useState(savedData?.logoUrl && savedData.logoUrl.trim() !== "" ? savedData.logoUrl : CRC_LOGO_CIRCLE_URL);
  const [logoUrlSquare, setLogoUrlSquare] = useState(savedData?.logoUrlSquare && savedData.logoUrlSquare.trim() !== "" ? savedData.logoUrlSquare : CRC_LOGO_URL);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [ctaUploading, setCtaUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [removeBackgroundOption, setRemoveBackgroundOption] = useState(false);
  const [removeBackgroundLogo, setRemoveBackgroundLogo] = useState(false);
  const [removingBackground, setRemovingBackground] = useState(false);
  
  // Image cropping state
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState("");
  const [cropConfig, setCropConfig] = useState({ type: null, aspectRatio: 1, outputSize: { width: 300, height: 300 }, circular: false });

  // Handle mobile/desktop layout switching on resize
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      if (isMobile && signatureLayout !== "mobile") {
        // On mobile, switch to mobile layout
        setSignatureLayout("mobile");
      } else if (!isMobile && signatureLayout === "mobile") {
        // If user switches to desktop and was on mobile, default to classic
        const saved = loadSavedData();
        if (saved?.signatureLayout && saved.signatureLayout !== "mobile") {
          setSignatureLayout(saved.signatureLayout);
        } else {
          setSignatureLayout("classic");
        }
      }
    };

    // Check on mount - only switch to mobile if actually on mobile
    if (typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 768;
      if (isMobile && signatureLayout !== "mobile") {
        setSignatureLayout("mobile");
      }
    }

    // Listen for resize events
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [signatureLayout]); // Re-run when signatureLayout changes

  // Automatically remove background from default CRC logo for classic layout
  useEffect(() => {
    const processDefaultLogoBackground = async () => {
      // Only process if logoUrl is the default CRC circle logo and hasn't been processed yet
      // Check if it's the default URL and not already a data URL (which means it's been processed)
      if (logoUrl === CRC_LOGO_CIRCLE_URL && !logoUrl.startsWith('data:image')) {
        try {
          setRemovingBackground(true);
          
          // Fetch the logo image
          const response = await fetch(CRC_LOGO_CIRCLE_URL);
          if (!response.ok) {
            throw new Error(`Failed to fetch logo: ${response.status} ${response.statusText}`);
          }
          const blob = await response.blob();
          
          // Remove background with timeout
          const removeBackgroundPromise = removeBackground(blob);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Background removal timed out")), 60000)
          );
          
          const blobWithoutBackground = await Promise.race([
            removeBackgroundPromise,
            timeoutPromise
          ]);
          
          // Convert to data URL
          const reader = new FileReader();
          const processedLogoUrl = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Logo processing timed out"));
            }, 10000); // 10 second timeout for FileReader
            
            reader.onload = (e) => {
              clearTimeout(timeout);
              resolve(e.target.result);
            };
            reader.onerror = (error) => {
              clearTimeout(timeout);
              reject(new Error("Failed to process logo image"));
            };
            reader.readAsDataURL(blobWithoutBackground);
          });
          
          // Update logoUrl with processed version
          setLogoUrl(processedLogoUrl);
        } catch (error) {
          // Fail silently - keep original logo if processing fails
          if (process.env.NODE_ENV === 'development') {
            console.error("Failed to remove background from default logo:", error);
          }
          // Keep original logo if processing fails - don't update state
        } finally {
          setRemovingBackground(false);
        }
      }
    };
    
    processDefaultLogoBackground();
  }, [logoUrl]); // Re-run if logoUrl changes

  // Helper function to sanitize name for filename
  const sanitizeName = (name) => {
    if (!name || name.trim() === "") return "user";
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  // Helper function to generate filename
  const generateFilename = (type, name) => {
    const sanitized = sanitizeName(name);
    const timestamp = Math.floor(Date.now() / 1000);
    const prefix = sanitized || "user";
    return `${prefix}-${type}-${timestamp}.png`;
  };

  const formatPhoneNumber = (value) => {
    const input = value.replace(/\D/g, "").substring(0, 10);
    let formatted = "";
    if (input.length > 0) formatted = "(" + input.substring(0, 3);
    if (input.length > 3) formatted += ") " + input.substring(3, 6);
    if (input.length > 6) formatted += "-" + input.substring(6, 10);
    return formatted;
  };
  const cleanPhoneNumber = (phone) => phone.replace(/\D/g, "");

  // Handle file selection - open crop modal for photo and CTA, direct process for logo
  const handleFileSelect = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      let imageSrc = event.target.result;
      
      // Helper function to process background removal
      const processBackgroundRemoval = async (shouldRemove) => {
        if (!shouldRemove) return imageSrc;
        
        try {
          setRemovingBackground(true);
          
          // Convert data URL to blob for background removal
          const response = await fetch(imageSrc);
          const blob = await response.blob();
          
          // Validate image format
          const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
          if (!validTypes.includes(blob.type)) {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`Unsupported image type: ${blob.type}. Attempting background removal anyway.`);
            }
          }
          
          // Check image size (limit to 10MB to avoid memory issues)
          const maxSize = 10 * 1024 * 1024; // 10MB
          if (blob.size > maxSize) {
            throw new Error(`Image is too large (${(blob.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`);
          }
          
          // Remove background with timeout protection
          const removeBackgroundPromise = removeBackground(blob);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Background removal timed out. The image may be too complex.")), 60000)
          );
          
          const blobWithoutBackground = await Promise.race([
            removeBackgroundPromise,
            timeoutPromise
          ]);
          
          // Convert back to data URL
          const reader = new FileReader();
          return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Image processing timed out"));
            }, 10000); // 10 second timeout for FileReader
            
            reader.onload = (e) => {
              clearTimeout(timeout);
              resolve(e.target.result);
            };
            reader.onerror = () => {
              clearTimeout(timeout);
              reject(new Error("Failed to process the image after background removal"));
            };
            reader.readAsDataURL(blobWithoutBackground);
          });
        } catch (error) {
          // Production-ready error handling
          const errorMessage = error instanceof Error 
            ? error.message 
            : "An unknown error occurred during background removal";
          
          if (process.env.NODE_ENV === 'development') {
            console.error("Background removal error:", error);
          }
          
          alert(`Failed to remove background: ${errorMessage}\n\nUsing original image.`);
          return imageSrc;
        } finally {
          setRemovingBackground(false);
        }
      };
      
      if (type === "photo") {
        // Process background removal if option is checked
        imageSrc = await processBackgroundRemoval(removeBackgroundOption);
        
        // Open crop modal for photo
        // Always use square crop - we create both versions on upload
        setCropImageSrc(imageSrc);
        setCropConfig({
          type: "photo",
          aspectRatio: 1,
          outputSize: { width: 300, height: 300 },
          circular: false  // Always square, we create both versions on upload
        });
        setCropModalOpen(true);
      } else if (type === "cta") {
        // Open crop modal for CTA (no background removal for CTA)
        setCropImageSrc(imageSrc);
        setCropConfig({
          type: "cta",
          aspectRatio: 300 / 60,
          outputSize: { width: 300, height: 60 },
          circular: false
        });
        setCropModalOpen(true);
      } else if (type === "logo") {
        // Process background removal if option is checked
        imageSrc = await processBackgroundRemoval(removeBackgroundLogo);
        
        // Open crop modal for logo
        // Always use square crop - we create both versions on upload
        setCropImageSrc(imageSrc);
        setCropConfig({
          type: "logo",
          aspectRatio: 1,
          outputSize: { width: 90, height: 90 },
          circular: false  // Always square, we create both versions on upload
        });
        setCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
    
    // Reset the file input to allow re-uploading
    e.target.value = "";
  };

  // Handle crop completion and upload
  const handleCropComplete = async (croppedImageDataUrl) => {
    const { type } = cropConfig;
    
    if (type === "photo") {
      setPhotoUploading(true);
    } else if (type === "cta") {
      setCtaUploading(true);
    } else if (type === "logo") {
      setLogoUploading(true);
    }

    try {
      // For photos, always create both square and circular versions
      if (type === "photo") {
        // Square version is the square cropped image
        const squareResponse = await fetch(croppedImageDataUrl);
        const squareBlob = await squareResponse.blob();
        
        // Create circular version by applying circular clip to the square cropped image
        const img = await createImage(croppedImageDataUrl);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { alpha: true });
        canvas.width = 1200; // 4x resolution for high quality
        canvas.height = 1200;
        ctx.scale(4, 4);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        
        // Create circular clip
        ctx.beginPath();
        ctx.arc(150, 150, 150, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        // Draw the square image
        ctx.drawImage(img, 0, 0, 300, 300);
        
        // Convert circular version to blob
        const circularBlob = await new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to create circular image"));
          }, "image/png");
        });
        
        // Upload both versions
        const baseFilename = generateFilename("headshot", formData.name);
        const squareFilename = baseFilename.replace(/\.(png|jpg|jpeg)$/i, "_square.png");
        const circularFilename = baseFilename.replace(/\.(png|jpg|jpeg)$/i, "_circular.png");
        
        // Upload square version first
        const { error: squareError } = await supabase.storage
          .from("user-uploads")
          .upload(squareFilename, squareBlob, {
            contentType: "image/png",
            upsert: true,
          });
        if (squareError) throw squareError;
        
        // Upload circular version
        const { error: circularError } = await supabase.storage
          .from("user-uploads")
          .upload(circularFilename, circularBlob, {
            contentType: "image/png",
            upsert: true,
          });
        if (circularError) throw circularError;
        
        // Get public URLs
        const { publicUrl: squareUrl } = supabase.storage
          .from("user-uploads")
          .getPublicUrl(squareFilename);
        const { publicUrl: circularUrl } = supabase.storage
          .from("user-uploads")
          .getPublicUrl(circularFilename);
        
        const supabaseUrl = SUPABASE_URL;
        if (!supabaseUrl) {
          throw new Error("Supabase configuration error: NEXT_PUBLIC_SUPABASE_URL is not set. Please check your environment variables.");
        }
        
        const finalSquareUrl = squareUrl || `${supabaseUrl}/storage/v1/object/public/user-uploads/${squareFilename}`;
        const finalCircularUrl = circularUrl || `${supabaseUrl}/storage/v1/object/public/user-uploads/${circularFilename}`;
        
        // Save square version (for stacked and no-logo layouts)
        setPhotoUrlSquare(finalSquareUrl);
        // Save circular version (for classic layout)
        setPhotoUrl(finalCircularUrl);
        setPhotoPreview("");
      } else if (type === "logo") {
        // For logos, always create both square and circular versions
        // Square version is the square cropped image
        const squareResponse = await fetch(croppedImageDataUrl);
        const squareBlob = await squareResponse.blob();
        
        // Create circular version by applying circular clip to the square cropped image
        const img = await createImage(croppedImageDataUrl);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { alpha: true });
        canvas.width = 360; // 4x resolution for high quality (90 * 4)
        canvas.height = 360;
        ctx.scale(4, 4);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        
        // Create circular clip
        ctx.beginPath();
        ctx.arc(45, 45, 45, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        // Draw the square image
        ctx.drawImage(img, 0, 0, 90, 90);
        
        // Convert circular version to blob
        const circularBlob = await new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to create circular logo"));
          }, "image/png");
        });
        
        // Upload both versions
        const baseFilename = generateFilename("logo", formData.companyName || formData.name);
        const squareFilename = baseFilename.replace(/\.(png|jpg|jpeg)$/i, "_square.png");
        const circularFilename = baseFilename.replace(/\.(png|jpg|jpeg)$/i, "_circular.png");
        
        // Upload square version first
        const { error: squareError } = await supabase.storage
          .from("user-uploads")
          .upload(squareFilename, squareBlob, {
            contentType: "image/png",
            upsert: true,
          });
        if (squareError) throw squareError;
        
        // Upload circular version
        const { error: circularError } = await supabase.storage
          .from("user-uploads")
          .upload(circularFilename, circularBlob, {
            contentType: "image/png",
            upsert: true,
          });
        if (circularError) throw circularError;
        
        // Get public URLs
        const { publicUrl: squareUrl } = supabase.storage
          .from("user-uploads")
          .getPublicUrl(squareFilename);
        const { publicUrl: circularUrl } = supabase.storage
          .from("user-uploads")
          .getPublicUrl(circularFilename);
        
        const supabaseUrl = SUPABASE_URL;
        if (!supabaseUrl) {
          throw new Error("Supabase configuration error: NEXT_PUBLIC_SUPABASE_URL is not set. Please check your environment variables.");
        }
        
        const finalSquareUrl = squareUrl || `${supabaseUrl}/storage/v1/object/public/user-uploads/${squareFilename}`;
        const finalCircularUrl = circularUrl || `${supabaseUrl}/storage/v1/object/public/user-uploads/${circularFilename}`;
        
        // Save square version (for stacked and no-logo layouts)
        setLogoUrlSquare(finalSquareUrl);
        // Save circular version (for classic layout)
        setLogoUrl(finalCircularUrl);
        setLogoPreview("");
      } else {
        // For CTA images, use existing logic
        const response = await fetch(croppedImageDataUrl);
        const blob = await response.blob();
        
        const contentType = "image/png";
        const filename = generateFilename("cta", formData.name);
        
        const { error } = await supabase.storage
          .from("user-uploads")
          .upload(filename, blob, {
            contentType: contentType,
            upsert: true,
          });

        if (error) throw error;

        const { publicUrl } = supabase.storage
          .from("user-uploads")
          .getPublicUrl(filename);

        if (publicUrl) {
          setCtaImageUrl(publicUrl);
        } else {
          const supabaseUrl = SUPABASE_URL;
          if (!supabaseUrl) {
            throw new Error("Supabase configuration error: NEXT_PUBLIC_SUPABASE_URL is not set. Please check your environment variables.");
          }
          const fallbackUrl = `${supabaseUrl}/storage/v1/object/public/user-uploads/${filename}`;
          setCtaImageUrl(fallbackUrl);
        }
      }
    } catch (error) {
      // Production-ready error handling
      const errorMessage = error instanceof Error 
        ? error.message 
        : "An unknown error occurred during upload";
      
      // Log detailed error in development only
      if (process.env.NODE_ENV === 'development') {
        console.error("Upload error:", error);
      }
      
      // User-friendly error message
      const userMessage = errorMessage.includes("Supabase") 
        ? "Configuration error: Please contact support."
        : `Failed to upload image: ${errorMessage}`;
      
      alert(userMessage);
    } finally {
      if (type === "photo") {
        setPhotoUploading(false);
      } else if (type === "cta") {
        setCtaUploading(false);
      } else if (type === "logo") {
        setLogoUploading(false);
      }
      setCropModalOpen(false);
      setCropImageSrc("");
    }
  };

  const getSocialIcon = (platform) => {
    const icons = {
      instagram: `${STORAGE_BASE_URL}/b0a3e2046_ig.png`,
      facebook:  `${STORAGE_BASE_URL}/0dbcedc5c_fb.png`,
      linkedin:  `${STORAGE_BASE_URL}/8c27916ab_linkedin.png`,
      twitter:   `${STORAGE_BASE_URL}/79598292a_x.png`,
      youtube:   `${STORAGE_BASE_URL}/5de9d954f_youtube.png`,
      tiktok:    `${STORAGE_BASE_URL}/3cb49a745_tiktok.png`,
      threads:   `${STORAGE_BASE_URL}/ad905c22b_threads.png`,
    };
    return icons[platform] || "";
  };

  const cleanUrl = (url, platform) => {
    if (!url) return "";
    url = url.trim();

    if (platform === "instagram" && url.startsWith("@")) return "https://instagram.com/" + url.substring(1);
    if (platform === "twitter"   && url.startsWith("@")) return "https://twitter.com/"   + url.substring(1);
    if (platform === "tiktok"    && url.startsWith("@")) return "https://tiktok.com/@"   + url.substring(1);
    if (platform === "threads"   && url.startsWith("@")) return "https://threads.net/@"  + url.substring(1);
    if (!url.startsWith("http")) {
      // If it contains spaces or doesn't look like a URL, encode it properly
      if (url.includes(" ") || (!url.includes(".") && !url.includes("/"))) {
        // It's likely text, not a URL - return as-is or encode it
        return "https://" + encodeURIComponent(url).replace(/%20/g, "-").toLowerCase();
      }
      return "https://" + url;
    }
    return url;
  };

  const generateSignature = useCallback(() => {
    // Check if user has entered personal data (name or email)
    const hasPersonalData = formData.name || formData.email;
    
    // Show placeholders when no personal data has been entered
    const name = formData.name ? formData.name.toUpperCase() : (hasPersonalData ? "" : "FIRST LAST");
    const title = formData.title || (hasPersonalData ? "" : "Real Estate Agent");
    const mobile = formData.mobile || (hasPersonalData ? "" : "(555) 555-5555");
    const email = formData.email || (hasPersonalData ? "" : "firstl@collectiverealtyco.com");
    const companyName = formData.companyName || "Collective Realty Co.";
    const officePhone = formData.officePhone || "(281) 638-9407";
    const officeFax = formData.officeFax || "(281) 516-5806";
    
    // Office addresses — pulled from officeData state (loaded from company_settings).
    // Falls back to hardcoded values until officeData is loaded.
    const officeAddresses = {
      houston: officeData?.houston?.address || "13201 Northwest Fwy Ste 450, Houston, TX 77040",
      irving: officeData?.irving?.address || "2300 Valley View Ln Ste 518, Irving, TX 75062",
      referral: officeData?.referral?.address || "13201 Northwest Fwy Ste 450, Houston, TX 77040"
    };
    
    // Format address for mobile layout - street on one line, city/state/zip on next line
    const formatAddressForMobile = (address) => {
      // Split by comma - format: "Street, City, State Zip"
      // We want: Street on one line, "City, State Zip" on next line
      const parts = address.split(', ');
      if (parts.length >= 3) {
        // Street is everything except last 2 parts (city and state/zip)
        const street = parts.slice(0, -2).join(', ');
        // City and state/zip stay together
        const cityStateZip = parts.slice(-2).join(', ');
        return `${street}<br>${cityStateZip}`;
      } else if (parts.length === 2) {
        // Fallback if format is different
        const street = parts[0];
        const cityStateZip = parts[1];
        return `${street}<br>${cityStateZip}`;
      }
      return address;
    };
    
    // Build address based on selected office - show Houston as default placeholder
    let fullAddress = "";
    if (signatureLayout === "mobile") {
      // For mobile layout, format addresses with city/state/zip on second line
      if (formData.selectedOffice === "Houston Office") {
        fullAddress = formatAddressForMobile(officeAddresses.houston);
      } else if (formData.selectedOffice === "Irving Office") {
        fullAddress = formatAddressForMobile(officeAddresses.irving);
      } else if (formData.selectedOffice === "Referral Collective") {
        fullAddress = formatAddressForMobile(officeAddresses.referral);
      } else if (formData.selectedOffice === "Both Offices") {
        fullAddress = `${formatAddressForMobile(officeAddresses.houston)}<br>${formatAddressForMobile(officeAddresses.irving)}`;
      } else if (!hasPersonalData) {
        // Show Houston office as default placeholder when no personal data
        fullAddress = formatAddressForMobile(officeAddresses.houston);
      }
    } else if (signatureLayout === "classic" || signatureType === "with-photo" || signatureType === "without-photo") {
      // For classic layout (both with-photo and without-photo), format addresses with city/state/zip on second line
      if (formData.selectedOffice === "Houston Office") {
        fullAddress = formatAddressForMobile(officeAddresses.houston);
      } else if (formData.selectedOffice === "Irving Office") {
        fullAddress = formatAddressForMobile(officeAddresses.irving);
      } else if (formData.selectedOffice === "Referral Collective") {
        fullAddress = formatAddressForMobile(officeAddresses.referral);
      } else if (formData.selectedOffice === "Both Offices") {
        fullAddress = `${formatAddressForMobile(officeAddresses.houston)}<br>${formatAddressForMobile(officeAddresses.irving)}`;
      } else if (!hasPersonalData) {
        // Show Houston office as default placeholder when no personal data
        fullAddress = formatAddressForMobile(officeAddresses.houston);
      }
    } else {
      // For other layouts, keep addresses as-is
      if (formData.selectedOffice === "Houston Office") {
        fullAddress = officeAddresses.houston;
      } else if (formData.selectedOffice === "Irving Office") {
        fullAddress = officeAddresses.irving;
      } else if (formData.selectedOffice === "Referral Collective") {
        fullAddress = officeAddresses.referral;
      } else if (formData.selectedOffice === "Both Offices") {
        fullAddress = `${officeAddresses.houston}<br>${officeAddresses.irving}`;
      } else if (!hasPersonalData) {
        // Show Houston office as default placeholder when no personal data
        fullAddress = officeAddresses.houston;
      }
    }

    // Show social links - limit to 4 icons only for preview (when no personal data)
    // For actual signature output, show all platforms with data (no limit)
    const socialPlatforms = ["instagram","facebook","linkedin","twitter","youtube","tiktok","threads"];
    const socialLinksArray = hasPersonalData
      ? socialPlatforms.filter((platform) => formData[platform]) // No limit - show all with data
      : socialPlatforms.slice(0, 4); // Show first 4 as placeholders for preview only
    
    const socialLinks = socialLinksArray.length > 0 ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;display:inline-table;">
      <tr>
        ${socialLinksArray.map((platform) => {
          const url = formData[platform] ? cleanUrl(formData[platform], platform) : "#";
          const icon = getSocialIcon(platform);
          const opacity = formData[platform] ? "1" : "0.3";
          return `<td style="padding-right:8px;vertical-align:middle;"><a href="${url}" style="opacity: ${opacity}; text-decoration: none;"><img src="${icon}" alt="${platform}" width="20" height="20" style="display:block;border:none;"></a></td>`;
        }).join("")}
      </tr>
    </table>` : "";

    // Sample images for preview when form is empty
    const samplePhotoUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cdefs%3E%3ClinearGradient id='photoGrad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23667eea;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23764ba2;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='150' cy='150' r='150' fill='url(%23photoGrad)'/%3E%3C/svg%3E";
    const samplePhotoUrlSquare = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cdefs%3E%3ClinearGradient id='photoGradSquare' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23667eea;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23764ba2;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' fill='url(%23photoGradSquare)'/%3E%3C/svg%3E";
    const sampleLogoUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='360'%3E%3Cdefs%3E%3ClinearGradient id='logoGrad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23f093fb;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23f5576c;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='180' cy='180' r='180' fill='url(%23logoGrad)'/%3E%3C/svg%3E";
    const sampleLogoUrlSquare = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='360'%3E%3Cdefs%3E%3ClinearGradient id='logoGradSquare' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23f093fb;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23f5576c;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='360' height='360' fill='url(%23logoGradSquare)'/%3E%3C/svg%3E";
    const sampleCtaUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='120'%3E%3Cdefs%3E%3ClinearGradient id='ctaGrad' x1='0%25' y1='0%25' x2='100%25' y2='0%25'%3E%3Cstop offset='0%25' style='stop-color:%23B8860B;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%238B7355;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='600' height='120' fill='url(%23ctaGrad)'/%3E%3Ctext x='300' y='65' font-family='Arial' font-size='24' fill='white' text-anchor='middle' font-weight='bold'%3ECall to Action%3C/text%3E%3C/svg%3E";
    
    // Use square samples for stacked and noLogo layouts, circular for classic
    const useSquareSamples = signatureLayout === "stacked" || signatureLayout === "noLogo";
    // Use square logo for stacked and noLogo, circular for classic
    // Logo should always show (it's pre-filled by default)
    let logoSrc;
    if (useSquareSamples) {
      // For stacked and no-logo layouts, use square version
      logoSrc = logoUrlSquare || logoUrl || logoPreview || sampleLogoUrlSquare;
    } else {
      // For classic layout, use circular version
      logoSrc = logoUrl || logoUrlSquare || logoPreview || sampleLogoUrl;
    }
    // Use square photo for stacked and noLogo, circular for classic
    // Show placeholder photo when no personal data entered
    let photoSrc;
    if (useSquareSamples) {
      // For stacked and no-logo layouts, use square version
      photoSrc = photoUrlSquare || photoUrl || photoPreview || (!hasPersonalData ? samplePhotoUrlSquare : "");
    } else {
      // For classic layout, use circular version
      photoSrc = photoUrl || photoUrlSquare || photoPreview || (!hasPersonalData ? samplePhotoUrl : "");
    }
    const ctaSrc = ctaImageUrl || (!hasPersonalData ? sampleCtaUrl : "");

    let html = "";
    
    // Mobile Layout
    if (signatureLayout === "mobile") {
      html = `<table cellpadding="0" cellspacing="0" border="0" style="width:340px;font-family:Arial,sans-serif;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
  <tr>
    <td width="3" bgcolor="#000" style="background-color:#000;width:3px;padding:0;margin:0;border:0;font-size:1px;line-height:1px;mso-line-height-rule:exactly;">&nbsp;</td>
    <td style="padding:12px;vertical-align:top;border:none;">
      ${name ? `<div style="font-size:11pt;font-weight:bold;color:#000;margin-bottom:2px;">${name}</div>` : ""}
      ${title ? `<div style="font-size:9pt;color:#666;margin-bottom:2px;">${title}</div>` : ""}
      ${companyName ? `<div style="font-size:9pt;font-weight:bold;color:#000;margin-bottom:6px;">${companyName}</div>` : ""}
      ${mobile ? `<div style="font-size:8pt;color:#333;margin-bottom:2px;"><strong>(M)</strong> <a href="tel:${cleanPhoneNumber(mobile)}" style="color:#000;text-decoration:none;">${mobile}</a></div>` : ""}
      ${officePhone ? `<div style="font-size:8pt;color:#333;margin-bottom:2px;"><strong>(O)</strong> <a href="tel:${cleanPhoneNumber(officePhone)}" style="color:#000;text-decoration:none;">${officePhone}</a></div>` : ""}
      ${officeFax ? `<div style="font-size:8pt;color:#333;margin-bottom:2px;"><strong>(F)</strong> ${officeFax}</div>` : ""}
      ${email ? `<div style="font-size:8pt;color:#333;margin-bottom:6px;"><a href="mailto:${email}" style="color:#000;text-decoration:none;">${email}</a></div>` : ""}
      ${fullAddress ? `<div style="font-size:7pt;color:#666;line-height:1.5;margin-bottom:6px;">${fullAddress}</div>` : ""}
      ${formData.website || !hasPersonalData ? `<div style="font-size:7pt;margin-bottom:6px;"><a href="${formData.website ? cleanUrl(formData.website) : '#'}" style="color:#000;text-decoration:none;opacity:${formData.website ? '1' : '0.5'};">${formData.website || "www.yourwebsite.com"}</a></div>` : ""}
    </td>
  </tr>
</table>`;
    }
    // Stacked Layout
    else if (signatureLayout === "stacked") {
      // Images should match content height
      const photoHtml = photoSrc
        ? `<img src="${photoSrc}" alt="Profile" width="100" height="109" style="display:block;width:100px;height:109px;object-fit:contain;border-radius:4px;vertical-align:top;margin:0;padding:0;" />`
        : "";
      
      const logoHtmlRect = logoSrc 
        ? `<img src="${logoSrc}" alt="${companyName || "Company"}" width="100" height="109" style="display:block;width:100px;height:109px;object-fit:contain;border-radius:4px;vertical-align:top;margin:0;padding:0;" />`
        : "";

      // Build address for stacked layout - format with street on one line, city/state/zip on next line
      const formatAddressForStacked = (address) => {
        // Split by comma - format: "Street, City, State Zip"
        // We want: Street on one line, "City, State Zip" on next line
        const parts = address.split(', ');
        if (parts.length >= 3) {
          // Street is everything except last 2 parts (city and state/zip)
          const street = parts.slice(0, -2).join(', ');
          // City and state/zip stay together
          const cityStateZip = parts.slice(-2).join(', ');
          return `${street}<br>${cityStateZip}`;
        } else if (parts.length === 2) {
          // Fallback if format is different
          const street = parts[0];
          const cityStateZip = parts[1];
          return `${street}<br>${cityStateZip}`;
        }
        return address;
      };
      
      let fullAddressStacked = "";
      if (formData.selectedOffice === "Houston Office") {
        fullAddressStacked = formatAddressForStacked(officeAddresses.houston);
      } else if (formData.selectedOffice === "Irving Office") {
        fullAddressStacked = formatAddressForStacked(officeAddresses.irving);
      } else if (formData.selectedOffice === "Referral Collective") {
        fullAddressStacked = formatAddressForStacked(officeAddresses.referral);
      } else if (formData.selectedOffice === "Both Offices") {
        fullAddressStacked = `${formatAddressForStacked(officeAddresses.houston)}<br>${formatAddressForStacked(officeAddresses.irving)}`;
      } else if (!hasPersonalData) {
        fullAddressStacked = formatAddressForStacked(officeAddresses.houston);
      }

      html = `<table cellpadding="0" cellspacing="0" border="0" style="width:305px;font-family:Arial,sans-serif;border-collapse:collapse;border:none;mso-table-lspace:0pt;mso-table-rspace:0pt;">
  <tr>
    <td valign="top" width="110" style="width:110px;padding-right:4px;padding-top:0;padding-bottom:4px;vertical-align:top;border:none;">
      ${photoHtml}
    </td>
    <td valign="top" width="170" style="width:170px;vertical-align:top;border:none;padding:0 4px;padding-bottom:4px;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:none;width:100%;">
        <tr>
          <td style="padding-top:0;padding-left:8px;padding-right:8px;border-top:none;border-bottom:none;">
            ${name ? `<div style="font-size:9pt;font-weight:bold;color:#000;margin-bottom:1px;">${name}</div>` : ""}
            ${title ? `<div style="font-size:8pt;color:#666;margin-top:0;margin-bottom:1px;line-height:1.2;">${title}</div>` : ""}
            ${mobile ? `<div style="font-size:7pt;color:#333;margin-bottom:1px;"><strong>(M)</strong> <a href="tel:${cleanPhoneNumber(mobile)}" style="color:#000;text-decoration:none;">${mobile}</a></div>` : ""}
            ${email ? `<div style="font-size:7pt;color:#333;margin-bottom:1px;"><a href="mailto:${email}" style="color:#000;text-decoration:none;">${email}</a></div>` : ""}
            ${formData.website || !hasPersonalData ? `<div style="font-size:7pt;color:#333;margin-bottom:1px;"><a href="${formData.website ? cleanUrl(formData.website) : '#'}" style="color:#000;text-decoration:none;opacity:${formData.website ? '1' : '0.5'};">${formData.website || "www.yourwebsite.com"}</a></div>` : ""}
            ${socialLinks ? `<div style="margin-top:8px;line-height:1;white-space:nowrap;">${socialLinks}</div>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td valign="top" width="110" style="width:110px;padding-right:4px;padding-top:4px;padding-bottom:0;vertical-align:top;border:none;${showBorder ? `border-top:3px solid ${borderColor};` : ''}">
      ${logoHtmlRect}
    </td>
    <td valign="top" width="170" style="width:170px;vertical-align:top;border:none;padding:0 4px;padding-top:4px;${showBorder ? `border-top:3px solid ${borderColor};` : ''}">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:none;width:100%;">
        <tr>
          <td style="padding-top:0;padding-left:8px;padding-right:8px;border-top:none;border-bottom:none;">
            ${companyName ? `<div style="font-size:9pt;font-weight:bold;color:#000;margin-bottom:1px;">${companyName}</div>` : ""}
            ${officePhone ? `<div style="font-size:7pt;color:#333;margin-bottom:1px;"><strong>(O)</strong> <a href="tel:${cleanPhoneNumber(officePhone)}" style="color:#000;text-decoration:none;">${officePhone}</a></div>` : ""}
            ${officeFax ? `<div style="font-size:7pt;color:#333;margin-bottom:1px;"><strong>(F)</strong> ${officeFax}</div>` : ""}
            ${fullAddressStacked ? `<div style="font-size:7pt;color:#333;margin-top:4px;"><a href="#" style="color:#000;text-decoration:none;">${fullAddressStacked}</a></div>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
    }
    // No Logo Layout (stacked without logo)
    else if (signatureLayout === "noLogo") {
      // Photo should match content height
      const photoHtml = photoSrc
        ? `<img src="${photoSrc}" alt="Profile" width="165" height="165" style="display:block;width:165px;height:165px;object-fit:cover;border-radius:4px;vertical-align:top;" />`
        : "";

      // Build address for no-logo layout - format with city/state/zip on new line
      let fullAddressNoLogo = "";
      if (formData.selectedOffice === "Houston Office") {
        fullAddressNoLogo = formatAddressForMobile(officeAddresses.houston);
      } else if (formData.selectedOffice === "Irving Office") {
        fullAddressNoLogo = formatAddressForMobile(officeAddresses.irving);
      } else if (formData.selectedOffice === "Referral Collective") {
        fullAddressNoLogo = formatAddressForMobile(officeAddresses.referral);
      } else if (formData.selectedOffice === "Both Offices") {
        fullAddressNoLogo = `${formatAddressForMobile(officeAddresses.houston)}<br>${formatAddressForMobile(officeAddresses.irving)}`;
      } else if (!hasPersonalData) {
        fullAddressNoLogo = formatAddressForMobile(officeAddresses.houston);
      }

      html = `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:380px;font-family:Arial,sans-serif;border-collapse:collapse;border:none;mso-table-lspace:0pt;mso-table-rspace:0pt;">
  <tr>
    <td width="165" style="width:165px;padding-right:8px;vertical-align:top;border:none;">
      ${photoHtml}
    </td>
    <td style="vertical-align:top;border:none;padding:0 8px;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:none;width:100%;">
        <tr>
          <td style="${showBorder ? `border-left:3px solid ${borderColor};` : ''}padding-left:12px;padding-right:4px;border-right:none;border-top:none;border-bottom:none;">
            ${name ? `<div style="font-size:10pt;font-weight:bold;color:#000;margin-bottom:1px;white-space:nowrap;">${name}</div>` : ""}
            ${title ? `<div style="font-size:9pt;color:#666;margin-top:0;margin-bottom:1px;line-height:1.2;">${title}</div>` : ""}
            ${companyName ? `<div style="font-size:9pt;font-weight:bold;color:#000;margin-bottom:8px;">${companyName}</div>` : ""}
            ${mobile ? `<div style="font-size:8pt;color:#333;margin-bottom:1px;"><strong>(M)</strong> <a href="tel:${cleanPhoneNumber(mobile)}" style="color:#000;text-decoration:none;">${mobile}</a></div>` : ""}
            ${officePhone ? `<div style="font-size:8pt;color:#333;margin-bottom:1px;"><strong>(O)</strong> <a href="tel:${cleanPhoneNumber(officePhone)}" style="color:#000;text-decoration:none;">${officePhone}</a></div>` : ""}
            ${officeFax ? `<div style="font-size:8pt;color:#333;margin-bottom:1px;"><strong>(F)</strong> ${officeFax}</div>` : ""}
            ${email ? `<div style="font-size:8pt;color:#333;margin-bottom:8px;"><a href="mailto:${email}" style="color:#000;text-decoration:none;">${email}</a></div>` : ""}
            ${fullAddressNoLogo ? `<div style="font-size:7pt;color:#666;line-height:1.5;margin-bottom:8px;">${fullAddressNoLogo}</div>` : ""}
            ${formData.website || !hasPersonalData ? `<div style="font-size:7pt;margin-bottom:8px;"><a href="${formData.website ? cleanUrl(formData.website) : '#'}" style="color:#000;text-decoration:none;opacity:${formData.website ? '1' : '0.5'};">${formData.website || "www.yourwebsite.com"}</a></div>` : ""}
            ${socialLinks ? `<div style="margin-top:8px;line-height:1;white-space:nowrap;">${socialLinks}</div>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
    } 
    // Classic Layout (with-photo or without-photo)
    else if (signatureType === "with-photo" || signatureLayout === "classic") {
      const photoHtml = photoSrc
        ? `<img src="${photoSrc}" alt="Profile" width="120" height="120" style="border-radius:50%;display:block;margin-bottom:1px;width:120px;max-width:100%;height:auto;object-fit:cover;" />`
        : "";

      const logoHtml = logoSrc 
        ? `<div style="margin-top:1px;text-align:right;"><img src="${logoSrc}" alt="${companyName || "Company"}" width="90" height="90" style="border-radius:50%;display:inline-block;width:90px;max-width:100%;height:auto;object-fit:cover;background-color:transparent;" /></div>`
        : "";

      html = `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:420px;font-family:Arial,sans-serif;border-collapse:collapse;border:none;mso-table-lspace:0pt;mso-table-rspace:0pt;">
  <tr>
    <td width="30%" style="padding-right:15px;vertical-align:top;border:none;">
      ${photoHtml}
      ${logoHtml}
    </td>
    <td style="vertical-align:top;border:none;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:none;">
        <tr>
          <td style="${showBorder ? `border-left:3px solid ${borderColor};` : ''}padding-left:8px;border-top:none;border-right:none;border-bottom:none;">
            ${name ? `<div style="font-size:11pt;font-weight:bold;color:#000;margin-bottom:1px;">${name}</div>` : ""}
            ${title ? `<div style="font-size:9pt;color:#666;margin-top:0;margin-bottom:1px;line-height:1.2;">${title}</div>` : ""}
            ${companyName ? `<div style="font-size:9pt;font-weight:bold;color:#000;margin-bottom:8px;">${companyName}</div>` : ""}
            ${mobile ? `<div style="font-size:8pt;color:#333;margin-bottom:1px;"><strong>(M)</strong> <a href="tel:${cleanPhoneNumber(mobile)}" style="color:#000;text-decoration:none;">${mobile}</a></div>` : ""}
            ${officePhone ? `<div style="font-size:8pt;color:#333;margin-bottom:1px;"><strong>(O)</strong> <a href="tel:${cleanPhoneNumber(officePhone)}" style="color:#000;text-decoration:none;">${officePhone}</a></div>` : ""}
            ${officeFax ? `<div style="font-size:8pt;color:#333;margin-bottom:1px;"><strong>(F)</strong> ${officeFax}</div>` : ""}
            ${email ? `<div style="font-size:8pt;color:#333;margin-bottom:8px;"><a href="mailto:${email}" style="color:#000;text-decoration:none;">${email}</a></div>` : ""}
            ${fullAddress ? `<div style="font-size:7pt;color:#666;line-height:1.5;margin-bottom:8px;">${fullAddress}</div>` : ""}
            ${formData.website || !hasPersonalData ? `<div style="font-size:7pt;margin-bottom:8px;"><a href="${formData.website ? cleanUrl(formData.website) : '#'}" style="color:#000;text-decoration:none;opacity:${formData.website ? '1' : '0.5'};">${formData.website || "www.yourwebsite.com"}</a></div>` : ""}
            ${socialLinks ? `<div style="margin-top:8px;line-height:1;white-space:nowrap;">${socialLinks}</div>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
    } else {
      // Without photo layout - use logo only
      const logoHtmlNoPhoto = logoSrc 
        ? `<div style="margin-top:12px;text-align:right;"><img src="${logoSrc}" alt="${companyName || "Company"}" width="90" height="90" style="border-radius:50%;display:inline-block;width:90px;max-width:100%;height:auto;object-fit:cover;" /></div>`
        : "";
      
      html = `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:420px;font-family:Arial,sans-serif;border-collapse:collapse;border:none;mso-table-lspace:0pt;mso-table-rspace:0pt;">
  <tr>
    <td width="30%" style="padding-right:15px;vertical-align:top;border:none;">
      ${logoHtmlNoPhoto}
    </td>
    <td style="vertical-align:top;border:none;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:none;">
        <tr>
          <td style="${showBorder ? `border-left:3px solid ${borderColor};` : ''}padding-left:8px;border-top:none;border-right:none;border-bottom:none;">
            ${name ? `<div style="font-size:11pt;font-weight:bold;color:#000;margin-bottom:1px;">${name}</div>` : ""}
            ${title ? `<div style="font-size:9pt;color:#666;margin-top:0;margin-bottom:1px;line-height:1.2;">${title}</div>` : ""}
            ${companyName ? `<div style="font-size:9pt;font-weight:bold;color:#000;margin-bottom:8px;">${companyName}</div>` : ""}
            ${mobile ? `<div style="font-size:8pt;color:#333;margin-bottom:1px;"><strong>(M)</strong> <a href="tel:${cleanPhoneNumber(mobile)}" style="color:#000;text-decoration:none;">${mobile}</a></div>` : ""}
            ${officePhone ? `<div style="font-size:8pt;color:#333;margin-bottom:1px;"><strong>(O)</strong> <a href="tel:${cleanPhoneNumber(officePhone)}" style="color:#000;text-decoration:none;">${officePhone}</a></div>` : ""}
            ${officeFax ? `<div style="font-size:8pt;color:#333;margin-bottom:1px;"><strong>(F)</strong> ${officeFax}</div>` : ""}
            ${email ? `<div style="font-size:8pt;color:#333;margin-bottom:8px;"><a href="mailto:${email}" style="color:#000;text-decoration:none;">${email}</a></div>` : ""}
            ${fullAddress ? `<div style="font-size:7pt;color:#666;line-height:1.5;margin-bottom:8px;">${fullAddress}</div>` : ""}
            ${formData.website || !hasPersonalData ? `<div style="font-size:7pt;margin-bottom:8px;"><a href="${formData.website ? cleanUrl(formData.website) : '#'}" style="color:#000;text-decoration:none;opacity:${formData.website ? '1' : '0.5'};">${formData.website || "www.yourwebsite.com"}</a></div>` : ""}
            ${socialLinks ? `<div style="margin-top:8px;line-height:1;white-space:nowrap;">${socialLinks}</div>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
    }

    // CTA Banner - only show if provided or no data at all, and NOT for mobile layout
    if (signatureLayout !== "mobile") {
      if (ctaSrc) {
        // Calculate CTA width based on layout
        let ctaWidth;
        let ctaImageWidth;
          if (signatureLayout === "stacked") {
            ctaWidth = "305px";
            ctaImageWidth = "305";
        } else if (signatureLayout === "noLogo") {
          ctaWidth = "360px";
          ctaImageWidth = "360";
        } else {
          // Classic
          ctaWidth = "300px";
          ctaImageWidth = "300";
        }
        
        html += `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${ctaWidth};font-family:Arial,sans-serif;border-collapse:collapse;margin-top:0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
  <tr>
    <td style="padding:0;border:none;">
      ${ctaLink ? `<a href="${cleanUrl(ctaLink)}">` : ''}<img src="${ctaSrc}" alt="Call to Action" width="${ctaImageWidth}" height="120" style="display:block;width:100%;max-width:${ctaImageWidth}px;height:auto;object-fit:cover;">${ctaLink ? '</a>' : ''}
    </td>
  </tr>
</table>`;
      }
    }

    // Custom Links section - show for all layouts in their own table
    if (formData.includeLink1 || formData.includeLink2) {
      // Preserve original styling: stacked uses 7pt/#333/#000, others use 8pt/#666
      const isStacked = signatureLayout === "stacked";
      const fontSize = isStacked ? "7pt" : "8pt";
      const textColor = isStacked ? "#333" : "#666";
      const linkColor = isStacked ? "#000" : "#666";
      const marginBottom = isStacked ? "4px" : "2px";
      
      html += '<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-family:Arial,sans-serif;border-collapse:collapse;margin-top:8px;mso-table-lspace:0pt;mso-table-rspace:0pt;"><tr><td style="padding:0;border:none;">';
      if (formData.includeLink1 && formData.linkText1) {
        if (formData.linkUrl1 && formData.linkUrl1.trim()) {
          const linkUrl = cleanUrl(formData.linkUrl1);
          html += `<div style="margin-bottom:${marginBottom};font-size:${fontSize};color:${textColor};"><a href="${linkUrl}" style="color:${linkColor};text-decoration:underline;">${formData.linkText1}</a></div>`;
        } else {
          html += `<div style="margin-bottom:${marginBottom};font-size:${fontSize};color:${textColor};">${formData.linkText1}</div>`;
        }
      } else if (formData.includeLink1) {
        html += `<div style="margin-bottom:${marginBottom};font-size:${fontSize};color:${textColor};opacity:0.5;"><a href="#" style="color:${linkColor};text-decoration:underline;">Texas Real Estate Commission Information About Brokerage Services</a></div>`;
      }
      if (formData.includeLink2 && formData.linkText2) {
        if (formData.linkUrl2 && formData.linkUrl2.trim()) {
          const linkUrl = cleanUrl(formData.linkUrl2);
          html += `<div style="font-size:${fontSize};color:${textColor};"><a href="${linkUrl}" style="color:${linkColor};text-decoration:underline;">${formData.linkText2}</a></div>`;
        } else {
          html += `<div style="font-size:${fontSize};color:${textColor};">${formData.linkText2}</div>`;
        }
      } else if (formData.includeLink2) {
        html += `<div style="font-size:${fontSize};color:${textColor};opacity:0.5;"><a href="#" style="color:${linkColor};text-decoration:underline;">Texas Real Estate Commission Consumer Protection Notice</a></div>`;
      }
      html += "</td></tr></table>";
    }

    return html;
  }, [formData, photoUrl, photoUrlSquare, photoPreview, logoUrl, logoPreview, signatureType, signatureLayout, ctaImageUrl, ctaLink, borderColor, showBorder]);

  // ──────────────────────────────────────────────────────────
  // Load saved signature from account on mount + when layout changes
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/email-signature?layout=${signatureLayout}`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!data.success || cancelled) return;

        // Capture office data (always returned, regardless of saved/default)
        if (data.office_data) setOfficeData(data.office_data);

        if (!data.signature) return;
        const sig = data.signature;
        if (sig.form_data) setFormData(prev => ({ ...prev, ...sig.form_data }));
        if (sig.photo_url) setPhotoUrl(sig.photo_url);
        if (sig.photo_url_square) setPhotoUrlSquare(sig.photo_url_square);
        if (sig.logo_url) setLogoUrl(sig.logo_url);
        if (sig.logo_url_square) setLogoUrlSquare(sig.logo_url_square);
        if (sig.cta_image_url) setCtaImageUrl(sig.cta_image_url);
        if (sig.cta_link) setCtaLink(sig.cta_link);
        if (sig.border_color) setBorderColor(sig.border_color);
        if (typeof sig.show_border === 'boolean') setShowBorder(sig.show_border);
        if (sig.signature_type) setSignatureType(sig.signature_type);
        if (sig.id) setLoadedFromAccount(true);
      } catch (e) {
        // Silent — auto-populated defaults remain
      }
    })();
    return () => { cancelled = true; };
  }, [signatureLayout]);

  // ──────────────────────────────────────────────────────────
  // When user changes selectedOffice, swap company name + logo + website + phone + fax
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!officeData) return;
    const sel = formData.selectedOffice;
    if (sel === "Referral Collective") {
      setFormData(prev => ({
        ...prev,
        companyName: officeData.referral.brandName,
        officePhone: officeData.referral.phone,
        officeFax: officeData.referral.fax,
        website: officeData.referral.website,
      }));
      if (officeData.referral.logoUrl) {
        setLogoUrl(officeData.referral.logoUrl);
        setLogoUrlSquare(officeData.referral.logoUrl);
      }
    } else if (sel === "Houston Office" || sel === "Irving Office" || sel === "Both Offices") {
      // CRC branding
      const phone = sel === "Irving Office" && officeData.irving.phone
        ? officeData.irving.phone
        : officeData.houston.phone;
      const fax = sel === "Irving Office" && officeData.irving.fax
        ? officeData.irving.fax
        : officeData.houston.fax;
      setFormData(prev => ({
        ...prev,
        companyName: officeData.crc.companyName,
        officePhone: phone,
        officeFax: fax,
        website: officeData.crc.website,
      }));
      // Restore CRC logo if currently using RC logo
      if (officeData.referral.logoUrl && (logoUrl === officeData.referral.logoUrl || logoUrlSquare === officeData.referral.logoUrl)) {
        setLogoUrl(CRC_LOGO_CIRCLE_URL);
        setLogoUrlSquare(CRC_LOGO_URL);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.selectedOffice, officeData]);

  // ──────────────────────────────────────────────────────────
  // Save current signature to account (per-layout)
  // ──────────────────────────────────────────────────────────
  const saveToAccount = async () => {
    setSavingToAccount(true);
    setAccountSaveStatus(null);
    try {
      const res = await fetch('/api/email-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          layout: signatureLayout,
          form_data: formData,
          photo_url: photoUrl || null,
          photo_url_square: photoUrlSquare || null,
          logo_url: logoUrl || null,
          logo_url_square: logoUrlSquare || null,
          cta_image_url: ctaImageUrl || null,
          cta_link: ctaLink || null,
          border_color: borderColor,
          show_border: showBorder,
          signature_type: signatureType,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setAccountSaveStatus('saved');
      setTimeout(() => setAccountSaveStatus(null), 2500);
    } catch (e) {
      setAccountSaveStatus('error');
      setTimeout(() => setAccountSaveStatus(null), 4000);
    } finally {
      setSavingToAccount(false);
    }
  };

  const copySignature = async () => {
    const html = generateSignature();
    try {
      // Method 1: Try modern Clipboard API with HTML support
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          const blob = new Blob([html], { type: "text/html" });
          const clipboardItem = new ClipboardItem({ "text/html": blob });
          await navigator.clipboard.write([clipboardItem]);
          setCopyStatus(true);
          setTimeout(() => setCopyStatus(false), 2000);
          return;
        } catch (e) {
          // ClipboardItem might not be supported, continue to fallback
        }
      }
      
      // Method 2: Use a hidden div with contentEditable for mobile HTML copying
      const range = document.createRange();
      const div = document.createElement("div");
      div.contentEditable = true;
      div.innerHTML = html;
      div.style.position = "fixed";
      div.style.left = "-9999px";
      div.style.top = "0";
      div.style.width = "1px";
      div.style.height = "1px";
      div.style.opacity = "0";
      div.style.pointerEvents = "none";
      document.body.appendChild(div);
      
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      try {
        const successful = document.execCommand("copy");
        if (successful) {
          setCopyStatus(true);
          setTimeout(() => setCopyStatus(false), 2000);
        } else {
          throw new Error("execCommand failed");
        }
      } catch (err) {
        // Method 3: Try clipboard.writeText as fallback (plain text only)
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(html);
          setCopyStatus(true);
          setTimeout(() => setCopyStatus(false), 2000);
        } else {
          throw new Error("Copy not supported");
        }
      } finally {
        selection.removeAllRanges();
        document.body.removeChild(div);
      }
    } catch (err) {
      // Final fallback: Show visible textarea for manual copy
      const textarea = document.createElement("textarea");
      textarea.value = html;
      textarea.style.position = "fixed";
      textarea.style.top = "50%";
      textarea.style.left = "50%";
      textarea.style.transform = "translate(-50%, -50%)";
      textarea.style.width = "90%";
      textarea.style.height = "300px";
      textarea.style.zIndex = "10000";
      textarea.style.padding = "12px";
      textarea.style.border = "2px solid #B8860B";
      textarea.style.borderRadius = "8px";
      textarea.style.fontSize = "12px";
      textarea.style.fontFamily = "monospace";
      document.body.appendChild(textarea);
      textarea.select();
      alert("Please manually copy the HTML from the text box that appeared, then paste it into your email client.");
      setTimeout(() => {
        if (document.body.contains(textarea)) {
          document.body.removeChild(textarea);
        }
      }, 10000);
    }
  };


  useEffect(() => {
    setPreviewHtml(generateSignature());
  }, [generateSignature]);

  // Update signatureType based on layout for backward compatibility
  useEffect(() => {
    if (signatureLayout === "classic") {
      setSignatureType("with-photo");
    }
  }, [signatureLayout]);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    try {
      const dataToSave = {
        signatureLayout,
        signatureType,
        ctaImageUrl,
        ctaLink,
        formData,
        photoUrl,
        photoUrlSquare,
        logoUrl,
        logoUrlSquare,
        borderColor,
        // Don't save showBorder - always default to true on page load
      };
      
      if (typeof window !== 'undefined') {
        localStorage.setItem("signatureGeneratorData", JSON.stringify(dataToSave));
      }
    } catch (error) {
      // Fail silently in production, log in development only
      if (process.env.NODE_ENV === 'development') {
        console.error("Error saving data:", error);
      }
      // Data saving failures are non-critical - user can still use the form
    }
  }, [signatureLayout, signatureType, ctaImageUrl, ctaLink, formData, photoUrl, photoUrlSquare, logoUrl, logoUrlSquare, borderColor]);

  return (
    <div className="font-sans overflow-x-hidden p-4 lg:p-6">
      {/* Mobile-only message */}
  <div className="md:hidden bg-white rounded-lg p-4 mb-4 text-center border border-[#e5e5e5]">
    <p className="text-base text-[#666]">
      📱 For mobile email apps. <span className="font-semibold">Visit on desktop for additional layout options.</span>
    </p>
  </div>
      <div className="max-w-[1600px] mx-auto flex flex-col lg:grid lg:grid-cols-2 gap-8 h-auto lg:h-[calc(100vh-40px)]">
        {/* LEFT COLUMN - Form */}
        <div className="flex flex-col overflow-visible lg:overflow-hidden order-2 lg:order-1 w-full lg:w-auto">
          {/* How to Use Instructions */}
          <details className="mb-6 bg-white rounded-lg border border-[#e5e5e5] p-4">
            <summary className="cursor-pointer font-serif text-sm font-semibold text-[#1a1a1a] flex items-center gap-2">
              <span>📖 How to Use This Tool</span>
            </summary>
            <div className="mt-3 text-sm text-[#666] space-y-2">
              <p><strong>Step 1:</strong> Choose your signature layout (Classic, Stacked, No Logo, or Mobile).</p>
              <p><strong>Step 2:</strong> Fill in your details using the tabs (Personal, Company, Social, Links).</p>
              <p><strong>Step 3:</strong> Upload your headshot and optional CTA banner - you can re-upload to resize, zoom, or adjust position for different layouts.</p>
              <p><strong>Step 4:</strong> Preview your signature, then click "Copy Signature".</p>
              <p><strong>Step 5:</strong> Paste into your email client's signature settings.</p>
              <div className="mt-3 pt-3 border-t border-[#e5e5e5]">
                <p className="text-xs"><strong>💾 Auto-Save:</strong> Your work is automatically saved in your browser's local storage. You can close this page and return anytime - your data will still be here! Note: Clearing your browser data or using incognito/private mode will prevent saving.</p>
              </div>
            </div>
          </details>
          {/* Layout Selector */}
          <div className="mb-6">
            <h3 className="font-serif text-base font-semibold text-[#1a1a1a] mb-4 tracking-wide">Signature Layout</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
              {/* Classic Layout Option */}
              <label
                onClick={(e) => {
                  e.preventDefault();
                  setSignatureLayout("classic");
                }}
                className={`cursor-pointer p-4 rounded-lg bg-white flex flex-col md:flex-row items-center md:items-center gap-2 transition-all duration-200 hidden md:block ${
                  signatureLayout === "classic" 
                    ? "border-2 border-[#B8860B] shadow-[0_4px_12px_rgba(184,134,11,0.2)]" 
                    : "border-2 border-[#e5e5e5] shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
                }`}
              >
                <input 
                  type="radio" 
                  name="layout" 
                  value="classic" 
                  checked={signatureLayout === "classic"} 
                  readOnly
                  className="hidden"
                />
                <div className="w-full md:w-20 h-12 md:h-20 rounded-md flex items-center gap-1 p-1 md:p-2 shrink-0 relative">
                  <div className="flex flex-col items-start gap-0.5">
                    <div className="w-[20px] h-[20px] md:w-[30px] md:h-[30px] rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] shrink-0"></div>
                    <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-gradient-to-br from-[#f093fb] to-[#f5576c] shrink-0 self-end"></div>
                  </div>
                  <div className="flex-1 h-[30px] md:h-[50px] border-l-2 border-black pl-1 md:pl-1.5 flex flex-col justify-center gap-0.5">
                    <div className="w-8 md:w-10 h-1.5 md:h-2 bg-[#ddd] rounded-sm"></div>
                    <div className="w-[25px] md:w-[30px] h-1 md:h-1.5 bg-[#eee] rounded-sm"></div>
                    <div className="w-[30px] md:w-[35px] h-1 md:h-1.5 bg-[#eee] rounded-sm"></div>
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-end justify-center min-h-[60px]">
                  <div className="text-xs font-semibold text-[#1a1a1a] text-center md:text-right">Classic Layout</div>
                  <div className="text-[10px] text-[#666] text-center md:text-right leading-snug hidden md:block mt-1">Circular headshot & logo</div>
                </div>
              </label>

              {/* Stacked Layout Option */}
              <label
                onClick={(e) => {
                  e.preventDefault();
                  setSignatureLayout("stacked");
                }}
                className={`cursor-pointer p-4 rounded-lg bg-white flex flex-col md:flex-row items-center md:items-center gap-2 transition-all duration-200 hidden md:block ${
                  signatureLayout === "stacked" 
                    ? "border-2 border-[#B8860B] shadow-[0_4px_12px_rgba(184,134,11,0.2)]" 
                    : "border-2 border-[#e5e5e5] shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
                }`}
              >
                <input 
                  type="radio" 
                  name="layout" 
                  value="stacked" 
                  checked={signatureLayout === "stacked"} 
                  readOnly
                  className="hidden"
                />
                <div className="w-full md:w-20 h-12 md:h-20 rounded-md flex flex-col gap-0.5 p-1 md:p-1.5 shrink-0">
                  {/* Row 1: Photo + Content */}
                  <div className="flex items-center gap-1 md:gap-1.5 flex-1">
                    <div className="w-[20px] h-[20px] md:w-[25px] md:h-[25px] rounded bg-gradient-to-br from-[#667eea] to-[#764ba2] shrink-0"></div>
                    <div className="flex-1 h-full pl-1 md:pl-1.5 flex flex-col justify-center gap-0.5">
                      <div className="w-[30px] md:w-[35px] h-1 md:h-1.5 bg-[#ddd] rounded-sm"></div>
                      <div className="w-[20px] md:w-[25px] h-0.5 md:h-1 bg-[#eee] rounded-sm"></div>
                    </div>
                  </div>
                  {/* Border line */}
                  <div className="w-full h-0.5 md:h-0.5 bg-black"></div>
                  {/* Row 2: Logo + Content */}
                  <div className="flex items-center gap-1 md:gap-1.5 flex-1">
                    <div className="w-[20px] h-[20px] md:w-[25px] md:h-[25px] rounded bg-gradient-to-br from-[#f093fb] to-[#f5576c] shrink-0"></div>
                    <div className="flex-1 h-full pl-1 md:pl-1.5 flex flex-col justify-center gap-0.5">
                      <div className="w-[28px] md:w-[33px] h-1 md:h-1.5 bg-[#ddd] rounded-sm"></div>
                      <div className="w-[22px] md:w-[27px] h-0.5 md:h-1 bg-[#eee] rounded-sm"></div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-end justify-center min-h-[60px]">
                  <div className="text-xs font-semibold text-[#1a1a1a] text-center md:text-right">Stacked</div>
                  <div className="text-[10px] text-[#666] text-center md:text-right leading-snug hidden md:block mt-1">Square headshot & logo</div>
                </div>
              </label>

              {/* No Logo Layout Option */}
              <label
                onClick={(e) => {
                  e.preventDefault();
                  setSignatureLayout("noLogo");
                }}
                className={`cursor-pointer p-4 rounded-lg bg-white flex flex-col md:flex-row items-center md:items-center gap-2 transition-all duration-200 hidden md:block ${
                  signatureLayout === "noLogo" 
                    ? "border-2 border-[#B8860B] shadow-[0_4px_12px_rgba(184,134,11,0.2)]" 
                    : "border-2 border-[#e5e5e5] shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
                }`}
              >
                <input 
                  type="radio" 
                  name="layout" 
                  value="noLogo" 
                  checked={signatureLayout === "noLogo"} 
                  readOnly
                  className="hidden"
                />
                <div className="w-full md:w-20 h-12 md:h-20 rounded-md flex items-center justify-start gap-1 md:gap-2 p-1 md:p-2 shrink-0">
                  <div className="w-[25px] h-[25px] md:w-[35px] md:h-[35px] rounded bg-gradient-to-br from-[#667eea] to-[#764ba2] shrink-0"></div>
                  <div className="flex-1 h-[30px] md:h-[60px] border-l-2 border-black px-1 md:px-2 flex flex-col justify-center gap-0.5">
                    <div className="w-[40px] md:w-[50px] h-1.5 md:h-2 bg-[#ddd] rounded-sm"></div>
                    <div className="w-8 md:w-10 h-1 md:h-1.5 bg-[#eee] rounded-sm"></div>
                    <div className="w-[35px] md:w-[45px] h-1 md:h-1.5 bg-[#eee] rounded-sm"></div>
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-end justify-center min-h-[60px]">
                  <div className="text-xs font-semibold text-[#1a1a1a] text-center md:text-right">No Logo</div>
                  <div className="text-[10px] text-[#666] text-center md:text-right leading-snug hidden md:block mt-1">Headshot only</div>
                </div>
              </label>

              {/* Mobile Layout Option */}
<label
  onClick={(e) => {
    e.preventDefault();
    setSignatureLayout("mobile");
  }}
  className={`cursor-pointer px-15 md:px-4 py-4 rounded-lg bg-white flex flex-row items-start gap-2 transition-all duration-200 ${
    signatureLayout === "mobile" 
      ? "border-2 border-[#B8860B] shadow-[0_4px_12px_rgba(184,134,11,0.2)]" 
      : "border-2 border-[#e5e5e5] shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
  }`}
>
  <input 
    type="radio" 
    name="layout" 
    value="mobile" 
    checked={signatureLayout === "mobile"} 
    readOnly
    className="hidden"
  />
  <div className="w-16 h-16 md:w-18 md:h-18 rounded-md flex items-start justify-center gap-1.5 md:gap-2 p-1.5 md:p-2 shrink-0 md:ml-1.5">
    <div className="w-0.5 h-full bg-black shrink-0"></div>
    <div className="flex-1 flex flex-col gap-0.5 pl-1">
      <div className="w-[50px] md:w-[60px] h-2 md:h-2.5 bg-[#ddd] rounded-sm"></div>
      <div className="w-[38px] md:w-[45px] h-1 md:h-1.5 bg-[#eee] rounded-sm"></div>
      <div className="w-[42px] md:w-[50px] h-1 md:h-1.5 bg-[#eee] rounded-sm"></div>
      <div className="w-[46px] md:w-[55px] h-1 md:h-1.5 bg-[#eee] rounded-sm"></div>
      <div className="w-8 md:w-10 h-1 md:h-1.5 bg-[#eee] rounded-sm"></div>
    </div>
  </div>
  <div className="flex-1 flex flex-col items-end justify-center min-h-[60px] md:mt-20">
    <div className="text-xs font-semibold text-[#1a1a1a] text-center md:text-right">Mobile App</div>
    <div className="text-[10px] text-[#666] text-center md:text-right leading-snug hidden md:block mt-1">Mobile optimized</div>
  </div>
</label>
            </div>
          </div>

          {/* Your Details Title */}
          <div className="mb-3">
            <h3 className="font-serif text-base font-semibold text-[#1a1a1a] mb-1 tracking-wide">Your Details</h3>
          </div>

          {/* Section Tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto lg:overflow-x-visible">
            {[
              { id: "personal", icon: "👤", label: "Personal" },
              { id: "company", icon: "🏢", label: "Company" },
              { id: "address", icon: "📍", label: "Address" },
              { id: "social", icon: "📱", label: "Social" },
              { id: "links", icon: "🔗", label: "Links" },
            ].filter((tab) => signatureLayout !== "mobile" || tab.id !== "social").map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[80px] p-3 bg-white rounded-lg cursor-pointer text-xl flex flex-col items-center gap-1 transition-all duration-200 ${
                  activeTab === tab.id
                    ? "border border-[#B8860B] shadow-[0_4px_12px_rgba(184,134,11,0.2)] text-[#B8860B]"
                    : "border border-[#e5e5e5] text-[#1a1a1a] hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
                }`}
              >
                <span className="grayscale">{tab.icon}</span>
                <span className={`text-[11px] font-medium ${
                  activeTab === tab.id ? "text-[#B8860B]" : "text-[#1a1a1a]"
                }`}>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Floating Card with Form Fields */}
          <div className="bg-white rounded-xl p-5 lg:p-10 shadow-[0_10px_40px_rgba(0,0,0,0.1)] flex-1 lg:overflow-y-auto overflow-visible transition-opacity duration-300">
            {/* Personal Tab */}
            {activeTab === "personal" && (
              <div className="opacity-100 transition-opacity duration-300">
                {(signatureLayout === "classic" || signatureLayout === "stacked" || signatureLayout === "noLogo") && (
                  <div className="mb-6">
                    <label className="block mb-2 font-serif text-[13px] text-[#1a1a1a] tracking-wide font-medium">Headshot or Logo</label>
                    <input type="file" ref={fileInputRef} accept="image/*" onChange={(e) => handleFileSelect(e, "photo")} className="hidden" disabled={photoUploading || removingBackground} />
                    <button 
                      onClick={() => fileInputRef.current?.click()} 
                      disabled={photoUploading || removingBackground}
                      className={`px-5 py-3 text-white border-none rounded-md text-sm transition-all duration-200 mb-3 ${
                        photoUploading || removingBackground
                          ? "bg-[#666] cursor-wait opacity-70" 
                          : "bg-[#1a1a1a] cursor-pointer hover:bg-[#B8860B]"
                      }`}
                    >
                      {removingBackground ? "🔄 Removing background..." : photoUploading ? "⏳ Uploading..." : "📷 Upload Headshot"}
                    </button>
                    {/* Background Removal Checkbox */}
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-[#666] hover:text-[#1a1a1a] transition-colors">
                        <input
                          type="checkbox"
                          checked={removeBackgroundOption}
                          onChange={(e) => setRemoveBackgroundOption(e.target.checked)}
                          disabled={photoUploading || removingBackground}
                          className="w-4 h-4 rounded border-[#e5e5e5] text-[#B8860B] focus:ring-[#B8860B] focus:ring-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <span>Remove background automatically</span>
                      </label>
                      {removingBackground && (
                        <p className="text-xs text-[#666] ml-6">Processing... This may take a few seconds</p>
                      )}
                    </div>
                    {((signatureLayout === "classic" ? photoUrl : photoUrlSquare) || photoUrl || photoUrlSquare || photoPreview) && (
                      <div className="mt-4 text-center">
                        <img 
                          src={(signatureLayout === "classic" ? photoUrl : photoUrlSquare) || photoUrl || photoUrlSquare || photoPreview} 
                          alt="Preview" 
                          className={`w-[120px] h-[120px] ${signatureLayout === "classic" ? "rounded-full" : "rounded"} object-cover border-[3px] border-[#e5e5e5]`} 
                        />
                        {photoUploading && (
                          <p className="text-xs text-[#666] mt-1">Uploading to storage...</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {[
                  ["Full Name", "name", "text", "John Smith", true],
                  ["Job Title", "title", "text", "Job Title", false],
                  ["Mobile Phone", "mobile", "text", "(555) 555-5555", false],
                  ["Email Address", "email", "email", "email@company.com", true],
                ].map(([label, key, type, placeholder, required]) => (
                  <div key={key} className="mb-4">
                    <label className="block mb-1.5 font-serif text-[13px] text-[#1a1a1a] tracking-wide font-medium">
                      {label} {required && <span className="text-[#d32f2f]">*</span>}
                    </label>
                    <input
                      type={type}
                      value={formData[key]}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [key]: key === "mobile" ? formatPhoneNumber(e.target.value) : e.target.value,
                        })
                      }
                      placeholder={placeholder}
                      maxLength={key === "mobile" ? 14 : undefined}
                      className="w-full p-3 border border-[#e5e5e5] rounded-md text-sm font-sans transition-colors duration-200 focus:border-[#B8860B] focus:outline-none"
                      required={required}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Company Tab */}
            {activeTab === "company" && (
              <div className="opacity-100 transition-opacity duration-300">
                <div className="mb-4">
                  <label className="block mb-1.5 font-serif text-[13px] text-[#1a1a1a] tracking-wide font-medium">Company Name</label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="Your Company Name"
                    className="w-full p-3 border border-[#e5e5e5] rounded-md text-sm font-sans transition-colors duration-200 focus:border-[#B8860B] focus:outline-none"
                  />
                </div>

                {signatureLayout !== "mobile" && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ 
                      display: "block", 
                      marginBottom: 6, 
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: "13px",
                      color: "#1a1a1a",
                      letterSpacing: "0.5px",
                      fontWeight: 500
                    }}>Optional Logo</label>
                  <input type="file" ref={logoInputRef} accept="image/*" onChange={(e) => handleFileSelect(e, "logo")} className="hidden" disabled={logoUploading || removingBackground} />
                  <button 
                    onClick={() => logoInputRef.current?.click()} 
                    disabled={logoUploading || removingBackground}
                    className={`px-5 py-3 text-white border-none rounded-md text-sm transition-all duration-200 mb-3 ${
                      logoUploading || removingBackground
                        ? "bg-[#666] cursor-wait opacity-70" 
                        : "bg-[#1a1a1a] cursor-pointer hover:bg-[#B8860B]"
                    }`}
                  >
                    {removingBackground ? "🔄 Removing background..." : logoUploading ? "⏳ Uploading..." : "📷 Upload Logo"}
                  </button>
                  {/* Background Removal Checkbox for Logo */}
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-[#666] hover:text-[#1a1a1a] transition-colors">
                      <input
                        type="checkbox"
                        checked={removeBackgroundLogo}
                        onChange={(e) => setRemoveBackgroundLogo(e.target.checked)}
                        disabled={logoUploading || removingBackground}
                        className="w-4 h-4 rounded border-[#e5e5e5] text-[#B8860B] focus:ring-[#B8860B] focus:ring-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span>Remove background automatically</span>
                    </label>
                    {removingBackground && (
                      <p className="text-xs text-[#666] ml-6">Processing... This may take a few seconds</p>
                    )}
                  </div>
                  {((signatureLayout === "classic" ? logoUrl : logoUrlSquare) || logoUrl || logoUrlSquare || logoPreview) && (
                    <div className="mt-4 text-center">
                      <img 
                        src={(signatureLayout === "classic" ? logoUrl : logoUrlSquare) || logoUrl || logoUrlSquare || logoPreview} 
                        alt="Logo Preview" 
                        className={`w-[90px] h-[90px] ${signatureLayout === "classic" ? "rounded-full" : "rounded"} object-cover border-2 border-[#e5e5e5]`}
                        style={{ backgroundColor: signatureLayout === "classic" ? "transparent" : undefined }}
                      />
                      {logoUploading && (
                        <p className="text-xs text-[#666] mt-1">Uploading to storage...</p>
                      )}
                      {/* Reset to default logo option - only show if custom logo has been uploaded */}
                      {(logoUrl !== CRC_LOGO_CIRCLE_URL || logoUrlSquare !== CRC_LOGO_URL) && !logoUploading && (
                        <div className="mt-3 text-left">
                          <button
                            onClick={() => {
                              setLogoUrl(CRC_LOGO_CIRCLE_URL);
                              setLogoUrlSquare(CRC_LOGO_URL);
                              setLogoPreview("");
                            }}
                            className="px-4 py-2 text-sm text-[#666] border border-[#e5e5e5] rounded-md hover:bg-[#f5f5f5] hover:border-[#B8860B] transition-all duration-200"
                          >
                            Use Default Logo
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                )}

                {[
                  ["Office Phone", "officePhone", "(555) 555-5555"],
                  ["Office Fax", "officeFax", "(555) 555-5555"],
                ].map(([label, key, placeholder]) => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <label style={{ 
                      display: "block", 
                      marginBottom: 6, 
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: "13px",
                      color: "#1a1a1a",
                      letterSpacing: "0.5px",
                      fontWeight: 500
                    }}>{label}</label>
                    <input
                      type="text"
                      value={formData[key]}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [key]: formatPhoneNumber(e.target.value),
                        })
                      }
                      placeholder={placeholder}
                      maxLength={14}
                      style={{ 
                        width: "100%", 
                        padding: "12px", 
                        border: "1px solid #e5e5e5", 
                        borderRadius: 6, 
                        fontSize: 14,
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
                        transition: "border-color 200ms ease"
                      }}
                      onFocus={(e) => e.target.style.borderColor = "#B8860B"}
                      onBlur={(e) => e.target.style.borderColor = "#e5e5e5"}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Address Tab */}
            {activeTab === "address" && (
              <div style={{ opacity: 1, transition: "opacity 300ms ease-in-out" }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ 
                    display: "block", 
                    marginBottom: 6, 
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: "13px",
                    color: "#1a1a1a",
                    letterSpacing: "0.5px",
                    fontWeight: 500
                  }}>Office Location</label>
                  <select
                    value={formData.selectedOffice || ""}
                    onChange={(e) => setFormData({ ...formData, selectedOffice: e.target.value })}
                    style={{ 
                      width: "100%", 
                      padding: "12px", 
                      border: "1px solid #e5e5e5", 
                      borderRadius: 6, 
                      fontSize: 14,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
                      transition: "border-color 200ms ease",
                      backgroundColor: "#fff",
                      cursor: "pointer"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#B8860B"}
                    onBlur={(e) => e.target.style.borderColor = "#e5e5e5"}
                  >
                    <option value="">-- Select Office --</option>
                    <option value="Houston Office">CRC — Houston Office</option>
                    <option value="Irving Office">CRC — Irving Office</option>
                    <option value="Both Offices">CRC — Both Offices</option>
                    <option value="Referral Collective">Referral Collective</option>
                  </select>
                </div>
              </div>
            )}

            {/* Social Tab */}
            {activeTab === "social" && (
              <div style={{ opacity: 1, transition: "opacity 300ms ease-in-out" }}>
                {signatureLayout === "mobile" ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                    <p>Social media fields are not available for mobile signatures.</p>
                  </div>
                ) : (
                  <>
                {[
                  ["Instagram", "instagram", "@username or full URL"],
                  ["Facebook", "facebook", "Profile URL"],
                  ["LinkedIn", "linkedin", "Profile URL"],
                  ["Twitter/X", "twitter", "@username or full URL"],
                  ["YouTube", "youtube", "Profile URL"],
                  ["TikTok", "tiktok", "@username or full URL"],
                  ["Threads", "threads", "@username or full URL"],
                ].map(([label, key, placeholder]) => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <label style={{ 
                      display: "block", 
                      marginBottom: 6, 
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: "13px",
                      color: "#1a1a1a",
                      letterSpacing: "0.5px",
                      fontWeight: 500
                    }}>{label}</label>
                    <input
                      type="text"
                      value={formData[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      placeholder={placeholder}
                      style={{ 
                        width: "100%", 
                        padding: "12px", 
                        border: "1px solid #e5e5e5", 
                        borderRadius: 6, 
                        fontSize: 14,
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
                        transition: "border-color 200ms ease"
                      }}
                      onFocus={(e) => e.target.style.borderColor = "#B8860B"}
                      onBlur={(e) => e.target.style.borderColor = "#e5e5e5"}
                    />
                    {placeholder.startsWith("@") && (
                      <p style={{ fontSize: 11, color: "#666", marginTop: 4, fontStyle: "italic" }}>💡 You can use @username or paste the full URL</p>
                    )}
                  </div>
                ))}
                  </>
                )}
              </div>
            )}

            {/* Links Tab */}
            {activeTab === "links" && (
              <div className="opacity-100 transition-opacity duration-300">
                {/* Website Field - Available for all layouts including mobile */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ 
                    display: "block", 
                    marginBottom: 6, 
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: "13px",
                    color: "#1a1a1a",
                    letterSpacing: "0.5px",
                    fontWeight: 500
                  }}>Website</label>
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="yourwebsite.com"
                    style={{ 
                      width: "100%", 
                      padding: "12px", 
                      border: "1px solid #e5e5e5", 
                      borderRadius: 6, 
                      fontSize: 14,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
                      transition: "border-color 200ms ease"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#B8860B"}
                    onBlur={(e) => e.target.style.borderColor = "#e5e5e5"}
                  />
                </div>
                {signatureLayout !== "mobile" && (
                  <>
                    {/* Hide Border Toggle */}
                    <div className="mb-6">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!showBorder}
                          onChange={(e) => setShowBorder(!e.target.checked)}
                          className="w-5 h-5 rounded border border-[#e5e5e5] cursor-pointer accent-[#B8860B]"
                        />
                        <span className="font-serif text-[13px] text-[#1a1a1a] tracking-wide font-medium">Hide Border</span>
                      </label>
                    </div>
                    {/* Border Color Picker */}
                    {showBorder && (
                      <div className="mb-6">
                        <label className="block mb-1.5 font-serif text-[13px] text-[#1a1a1a] tracking-wide font-medium">Border Color</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={borderColor}
                            onChange={(e) => setBorderColor(e.target.value)}
                            className="w-16 h-10 rounded border border-[#e5e5e5] cursor-pointer"
                          />
                          <input
                            type="text"
                            value={borderColor}
                            onChange={(e) => setBorderColor(e.target.value)}
                            placeholder="#000000"
                            className="flex-1 p-3 border border-[#e5e5e5] rounded-md text-sm font-sans transition-colors duration-200 focus:border-[#B8860B] focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                    <div style={{ marginBottom: 24 }}>
                      <label style={{ 
                        display: "block", 
                        marginBottom: 6, 
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        fontSize: "13px",
                        color: "#1a1a1a",
                        letterSpacing: "0.5px",
                        fontWeight: 500
                      }}>Call to Action Banner (300x60)</label>
                      <input type="file" ref={ctaInputRef} accept="image/*" onChange={(e) => handleFileSelect(e, "cta")} style={{ display: "none" }} disabled={ctaUploading} />
                      <button 
                        onClick={() => ctaInputRef.current?.click()} 
                        disabled={ctaUploading}
                        style={{ 
                          padding: "12px 20px", 
                          background: ctaUploading ? "#666" : "#1a1a1a", 
                          color: "#fff", 
                          border: "none", 
                          borderRadius: 6, 
                          cursor: ctaUploading ? "wait" : "pointer", 
                          fontSize: 14,
                          opacity: ctaUploading ? 0.7 : 1,
                          transition: "all 200ms ease"
                        }}
                        onMouseEnter={(e) => {
                          if (!ctaUploading) {
                            e.currentTarget.style.background = "#B8860B";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!ctaUploading) {
                            e.currentTarget.style.background = "#1a1a1a";
                          }
                        }}
                      >
                        {ctaUploading ? "⏳ Uploading..." : "📷 Upload CTA Banner"}
                      </button>
                      {ctaImageUrl && (
                        <div style={{ marginTop: 15, textAlign: "center" }}>
                          <img src={ctaImageUrl} alt="CTA Banner Preview" style={{ maxWidth: "100%", border: "2px solid #e5e5e5", borderRadius: 4 }} />
                          {ctaUploading && (
                            <p style={{ fontSize: 12, color: "#666", marginTop: 5 }}>Uploading to storage...</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ marginBottom: 24 }}>
                      <label style={{ 
                        display: "block", 
                        marginBottom: 6, 
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        fontSize: "13px",
                        color: "#1a1a1a",
                        letterSpacing: "0.5px",
                        fontWeight: 500
                      }}>Call to Action Link</label>
                      <input
                        type="text"
                        value={ctaLink}
                        onChange={(e) => setCtaLink(e.target.value)}
                        placeholder="https://yourlandingpage.com"
                        style={{ 
                          width: "100%", 
                          padding: "12px", 
                          border: "1px solid #e5e5e5", 
                          borderRadius: 6, 
                          fontSize: 14,
                          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
                          transition: "border-color 200ms ease"
                        }}
                        onFocus={(e) => e.target.style.borderColor = "#B8860B"}
                        onBlur={(e) => e.target.style.borderColor = "#e5e5e5"}
                      />
                    </div>
                  </>
                )}

                <p style={{ fontSize: 12, color: "#666", marginBottom: 16, fontStyle: "italic" }}>
                  Add custom disclaimer links, legal notices, or other links to appear at the bottom of your signature in small text.
                </p>

                {/* Link 1 */}
                <div style={{ marginBottom: 20, padding: 16, background: "#f9f9f9", borderRadius: 8 }}>
                  <CheckboxRow
                    checked={formData.includeLink1}
                    label="Include Link 1"
                    onChange={(v) => setFormData({ ...formData, includeLink1: v })}
                  />
                  {formData.includeLink1 && (
                    <>
                      <div style={{ marginTop: 12, marginBottom: 12 }}>
                        <label style={{ 
                          display: "block", 
                          marginBottom: 6, 
                          fontFamily: "Georgia, 'Times New Roman', serif",
                          fontSize: "13px",
                          color: "#1a1a1a",
                          letterSpacing: "0.5px",
                          fontWeight: 500
                        }}>Link Text 1</label>
                        <input
                          type="text"
                          value={formData.linkText1}
                          onChange={(e) => setFormData({ ...formData, linkText1: e.target.value })}
                          placeholder="Texas Real Estate Commission Information About Brokerage Services"
                          style={{ 
                            width: "100%", 
                            padding: "12px", 
                            border: "1px solid #e5e5e5", 
                            borderRadius: 6, 
                            fontSize: 14,
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
                            transition: "border-color 200ms ease"
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#B8860B"}
                          onBlur={(e) => e.target.style.borderColor = "#e5e5e5"}
                        />
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ 
                          display: "block", 
                          marginBottom: 6, 
                          fontFamily: "Georgia, 'Times New Roman', serif",
                          fontSize: "13px",
                          color: "#1a1a1a",
                          letterSpacing: "0.5px",
                          fontWeight: 500
                        }}>Link URL 1</label>
                        <input
                          type="text"
                          value={formData.linkUrl1}
                          onChange={(e) => setFormData({ ...formData, linkUrl1: e.target.value })}
                          placeholder="Enter your link URL"
                          style={{ 
                            width: "100%", 
                            padding: "12px", 
                            border: "1px solid #e5e5e5", 
                            borderRadius: 6, 
                            fontSize: 14,
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
                            transition: "border-color 200ms ease"
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#B8860B"}
                          onBlur={(e) => e.target.style.borderColor = "#e5e5e5"}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Link 2 */}
                <div style={{ marginBottom: 20, padding: 16, background: "#f9f9f9", borderRadius: 8 }}>
                  <CheckboxRow
                    checked={formData.includeLink2}
                    label="Include Link 2"
                    onChange={(v) => setFormData({ ...formData, includeLink2: v })}
                  />
                  {formData.includeLink2 && (
                    <>
                      <div style={{ marginTop: 12, marginBottom: 12 }}>
                        <label style={{ 
                          display: "block", 
                          marginBottom: 6, 
                          fontFamily: "Georgia, 'Times New Roman', serif",
                          fontSize: "13px",
                          color: "#1a1a1a",
                          letterSpacing: "0.5px",
                          fontWeight: 500
                        }}>Link Text 2</label>
                        <input
                          type="text"
                          value={formData.linkText2}
                          onChange={(e) => setFormData({ ...formData, linkText2: e.target.value })}
                          placeholder="Texas Real Estate Commission Consumer Protection Notice"
                          style={{ 
                            width: "100%", 
                            padding: "12px", 
                            border: "1px solid #e5e5e5", 
                            borderRadius: 6, 
                            fontSize: 14,
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
                            transition: "border-color 200ms ease"
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#B8860B"}
                          onBlur={(e) => e.target.style.borderColor = "#e5e5e5"}
                        />
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ 
                          display: "block", 
                          marginBottom: 6, 
                          fontFamily: "Georgia, 'Times New Roman', serif",
                          fontSize: "13px",
                          color: "#1a1a1a",
                          letterSpacing: "0.5px",
                          fontWeight: 500
                        }}>Link URL 2</label>
                        <input
                          type="text"
                          value={formData.linkUrl2}
                          onChange={(e) => setFormData({ ...formData, linkUrl2: e.target.value })}
                          placeholder="Enter your link URL"
                          style={{ 
                            width: "100%", 
                            padding: "12px", 
                            border: "1px solid #e5e5e5", 
                            borderRadius: 6, 
                            fontSize: 14,
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
                            transition: "border-color 200ms ease"
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#B8860B"}
                          onBlur={(e) => e.target.style.borderColor = "#e5e5e5"}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN - Preview */}
        <div className="flex flex-col overflow-hidden order-1 lg:order-2 w-full lg:w-auto">
          <div className="bg-white rounded-xl p-5 lg:p-10 shadow-[0_10px_40px_rgba(0,0,0,0.1)] flex flex-col">
            <h2 className="m-0 mb-6 text-xl font-serif font-semibold text-[#1a1a1a]">Preview & Copy</h2>
            <div
              className="bg-white p-5 rounded-lg border border-[#e5e5e5] mb-5 overflow-auto w-full"
            >
              <div 
                className="w-full"
                style={{ 
                  maxWidth: '100%',
                  width: '100%'
                }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
            
            <button
              onClick={copySignature}
              className={`w-full p-4 text-white border-none rounded-lg text-base font-semibold cursor-pointer mb-3 transition-all duration-200 ${
                copyStatus ? "bg-[#28a745]" : "bg-[#1a1a1a] hover:bg-[#B8860B]"
              }`}
            >
              {copyStatus ? "✓ Copied!" : "📋 Copy Signature"}
            </button>

            <button
              onClick={saveToAccount}
              disabled={savingToAccount}
              className={`w-full p-3 border rounded-lg text-sm font-semibold cursor-pointer mb-4 transition-all duration-200 ${
                accountSaveStatus === 'saved'
                  ? 'bg-white border-[#28a745] text-[#28a745]'
                  : accountSaveStatus === 'error'
                  ? 'bg-white border-[#dc3545] text-[#dc3545]'
                  : 'bg-white border-[#e5e5e5] text-[#1a1a1a] hover:border-[#B8860B] hover:text-[#B8860B]'
              } ${savingToAccount ? 'opacity-60 cursor-wait' : ''}`}
            >
              {savingToAccount
                ? 'Saving...'
                : accountSaveStatus === 'saved'
                ? '✓ Saved to your account'
                : accountSaveStatus === 'error'
                ? '⚠ Save failed — try again'
                : (loadedFromAccount ? '💾 Update saved signature' : '💾 Save to account')}
            </button>

            <details className="mb-6 bg-white rounded-lg border border-[#e5e5e5] p-4">
              <summary className="cursor-pointer font-serif text-sm font-semibold text-[#1a1a1a] flex items-center gap-2">
                <span>How to Add to Your Email Client</span>
              </summary>
              <div className="mt-3 text-sm text-[#666] space-y-2">
                <p><strong>Step 1:</strong> After completing the form, <strong>click Copy Signature</strong>.</p>
                <p><strong>Step 2:</strong> Open your email client (Gmail, Outlook, Apple Mail, etc.).</p>
                <p><strong>Step 3:</strong> Navigate to <strong>Settings</strong> or <strong>Preferences</strong>.</p>
                <p><strong>Step 4:</strong> Find the <strong>Signature</strong> section.</p>
                <p><strong>Step 5:</strong> Paste your signature into the signature box (Cmd/Ctrl + V).</p>
                <p><strong>Step 6:</strong> Enable auto-include on new messages and replies (optional).</p>
                <p><strong>Step 7:</strong> Click <strong>Save</strong>.</p>
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Image Crop Modal */}
      {cropModalOpen && (
        <ImageCropModal
          imageSrc={cropImageSrc}
          onClose={() => {
            setCropModalOpen(false);
            setCropImageSrc("");
          }}
          onCropComplete={handleCropComplete}
          cropType={cropConfig.type}
          aspectRatio={cropConfig.aspectRatio}
          outputSize={cropConfig.outputSize}
          circular={cropConfig.circular}
        />
      )}

    </div>
  );
}

function CheckboxRow({ checked, label, onChange }) {
  return (
    <label className="flex items-center cursor-pointer mb-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mr-2 w-[18px] h-[18px]" />
      <span className="font-semibold">{label}</span>
    </label>
  );
}


