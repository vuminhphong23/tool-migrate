// Simple test to check if our TypeScript files compile
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking project structure...');

const requiredFiles = [
  'src/main.tsx',
  'src/App.tsx', 
  'src/components/ConnectionForm.tsx',
  'src/components/CollectionList.tsx',
  'src/components/StatusDisplay.tsx',
  'src/lib/DirectusClient.ts',
  'src/lib/apiHandlers.ts',
  'src/types.ts',
  'index.html',
  'vite.config.ts',
  'tsconfig.json'
];

let allFilesExist = true;

requiredFiles.forEach(file => {
  if (fs.existsSync(path.join(__dirname, file))) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ Missing: ${file}`);
    allFilesExist = false;
  }
});

if (allFilesExist) {
  console.log('\n🎉 All required files exist!');
  console.log('\n📝 Next steps:');
  console.log('1. Make sure node_modules is properly installed');
  console.log('2. Try: npx vite');
  console.log('3. Or try: node_modules\\.bin\\vite');
} else {
  console.log('\n❌ Some files are missing. Please check the project structure.');
}

console.log('\n📦 Checking package.json...');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
console.log(`Name: ${pkg.name}`);
console.log(`Version: ${pkg.version}`);
console.log(`Scripts: ${Object.keys(pkg.scripts).join(', ')}`);
