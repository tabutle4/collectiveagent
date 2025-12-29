import { readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'

async function cropHeadshots() {
  console.log('🖼️  Starting headshot cropping process...\n')

  const headshotsDir = join(process.cwd(), 'public', 'headshots')
  const outputDir = join(process.cwd(), 'public', 'headshots', 'cropped')
  
  // Create output directory if it doesn't exist
  try {
    await require('fs').promises.mkdir(outputDir, { recursive: true })
  } catch (error) {
    // Directory might already exist
  }

  let files: string[]
  
  try {
    files = await readdir(headshotsDir)
    // Filter image files
    files = files.filter(file => {
      const lower = file.toLowerCase()
      return lower.startsWith('headshot-') && 
             (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) &&
             !file.includes('cropped') // Skip already cropped files
    })
    console.log(`📁 Found ${files.length} headshot files to crop\n`)
  } catch (error) {
    console.error('❌ Error reading headshots directory:', error)
    process.exit(1)
  }

  let successCount = 0
  let errorCount = 0

  for (const filename of files) {
    try {
      const inputPath = join(headshotsDir, filename)
      const outputPath = join(outputDir, filename)
      
      console.log(`🔄 Cropping: ${filename}...`)

      // Read image
      const imageBuffer = await readFile(inputPath)
      
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata()
      const width = metadata.width || 0
      const height = metadata.height || 0

      if (width === 0 || height === 0) {
        throw new Error('Invalid image dimensions')
      }

      // Crop strategy: Focus on upper portion (where faces usually are)
      // Crop to square from top-center, focusing on upper portion of image
      const cropSize = Math.min(width, height)
      
      // Ensure crop size is valid
      if (cropSize < 100) {
        throw new Error('Image too small to crop')
      }
      
      const cropX = Math.max(0, Math.floor((width - cropSize) / 2)) // Center horizontally
      const cropY = Math.max(0, Math.floor(height * 0.1)) // Start from 10% down (focus on upper portion)
      
      // Ensure crop area is within image bounds
      if (cropX + cropSize > width || cropY + cropSize > height) {
        // Fallback: use smaller crop size that fits
        const safeCropSize = Math.min(width - cropX, height - cropY, cropSize)
        if (safeCropSize < 100) {
          throw new Error('Cannot create valid crop area')
        }
        // Use the safe crop size
        const adjustedCropSize = safeCropSize
        await sharp(imageBuffer)
          .extract({
            left: cropX,
            top: cropY,
            width: adjustedCropSize,
            height: adjustedCropSize,
          })
          .resize(800, 800, {
            fit: 'cover',
            position: 'center',
          })
          .jpeg({ quality: 90 })
          .toFile(outputPath)
        successCount++
        console.log(`✅ Cropped: ${filename}`)
        continue
      }

      // Crop and resize to 800x800 (good quality for headshots)
      await sharp(imageBuffer)
        .extract({
          left: cropX,
          top: cropY,
          width: cropSize,
          height: cropSize,
        })
        .resize(800, 800, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 90 })
        .toFile(outputPath)

      successCount++
      console.log(`✅ Cropped: ${filename}`)
    } catch (error: any) {
      errorCount++
      console.error(`❌ Error cropping ${filename}:`, error.message)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 CROPPING SUMMARY')
  console.log('='.repeat(60))
  console.log(`✅ Successfully cropped: ${successCount} headshots`)
  console.log(`❌ Errors: ${errorCount}`)
  console.log(`📁 Output directory: ${outputDir}`)
  console.log('='.repeat(60) + '\n')
  console.log('✨ Cropping process complete!')
  console.log('\n💡 Next steps:')
  console.log('   1. Review the cropped images in public/headshots/cropped/')
  console.log('   2. If satisfied, replace the original files or update the matching script')
  console.log('   3. Re-run the matching script to upload cropped versions to Supabase\n')
}

// Run the script
cropHeadshots()
  .then(() => {
    console.log('✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

