# 🚀 FIRST TIME SETUP - START HERE

## Quick Start (5 minutes)

### 1. Open Terminal

Navigate to this project:
```bash
cd ~/Desktop/collective-agent
```

### 2. Run Setup Script

**Option A - Automatic (Recommended):**
```bash
./setup.sh
```

**Option B - Manual:**
```bash
npm install
npm uninstall tailwindcss
npm install -D tailwindcss@3 postcss autoprefixer
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Open in Browser

Go to: http://localhost:3000

---

## ✅ You Should See:

The prospective agent form at http://localhost:3000/prospective-agent-form

---

## 🎯 Next Steps

Once it's running locally:

1. **Test the form** - Submit a test prospect
2. **Create admin account** - Go to http://localhost:3000/auth/register
3. **Review deployment guide** - See `DEPLOYMENT.md`

---

## 🐛 Troubleshooting

**Error about Tailwind CSS?**
```bash
npm uninstall tailwindcss
npm install -D tailwindcss@3 postcss autoprefixer
npm run dev
```

**Port 3000 already in use?**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill
npm run dev
```

**Other errors?**
1. Delete `node_modules` folder
2. Delete `package-lock.json`
3. Run `npm install` again

---

## 📚 Full Documentation

- `COMPLETE.md` - Everything that's built
- `DEPLOYMENT.md` - Deploy to Vercel guide
- `README.md` - Technical details

---

**Ready to deploy?** See `DEPLOYMENT.md`
