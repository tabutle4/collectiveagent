# Button Styling Guide

## Standard Button Classes

All buttons across the site should use the following utility classes for consistency:

### Primary Button (Black)
```tsx
<button className="btn btn-black">
  Primary Action
</button>
```

**Or inline (for admin pages with responsive sizing):**
```tsx
<button className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90">
  Primary Action
</button>
```

### Secondary/Outline Button (White with Border)
```tsx
<button className="btn btn-outline">
  Secondary Action
</button>
```

**Or inline (for admin pages with responsive sizing):**
```tsx
<button className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black">
  Secondary Action
</button>
```

## CSS Classes (in globals.css)

The following utility classes are defined and should be used:

- `.btn` - Base button styles (padding, text size, transitions)
- `.btn-black` - Primary button (black background, white text)
- `.btn-outline` - Secondary button (white background, gray border)
- `.btn-white` - Alternative secondary button (same as outline)

## Guidelines

1. **Admin Pages**: Use inline classes with responsive sizing (`px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm`)
2. **Public/Auth Pages**: Can use utility classes (`.btn .btn-black` or `.btn .btn-outline`)
3. **Disabled State**: Add `disabled:opacity-50 disabled:cursor-not-allowed` for disabled buttons
4. **Icons**: Use `inline-flex items-center gap-2` when buttons contain icons
5. **Full Width**: Add `w-full` for full-width buttons

## Examples

### Button with Icon
```tsx
<button className="btn btn-black inline-flex items-center gap-2">
  <Plus size={16} />
  Add Item
</button>
```

### Disabled Button
```tsx
<button 
  className="btn btn-black disabled:opacity-50 disabled:cursor-not-allowed"
  disabled={loading}
>
  {loading ? 'Saving...' : 'Save'}
</button>
```

### Link as Button
```tsx
<Link 
  href="/path"
  className="btn btn-black inline-block"
>
  Go to Page
</Link>
```

